import { ActivityCreate, CacheFileObject, VideoTorrentObject } from '../../../../shared'
import { VideoCommentObject } from '../../../../shared/models/activitypub/objects/video-comment-object'
import { retryTransactionWrapper } from '../../../helpers/database-utils'
import { logger } from '../../../helpers/logger'
import { sequelizeTypescript } from '../../../initializers'
import { ActorModel } from '../../../models/activitypub/actor'
import { addVideoComment, resolveThread } from '../video-comments'
import { getOrCreateVideoAndAccountAndChannel } from '../videos'
import { forwardVideoRelatedActivity } from '../send/utils'
import { createOrUpdateCacheFile } from '../cache-file'
import { Notifier } from '../../notifier'
import { PlaylistObject } from '../../../../shared/models/activitypub/objects/playlist-object'
import { createOrUpdateVideoPlaylist } from '../playlist'
import { VideoModel } from '../../../models/video/video'

async function processCreateActivity (activity: ActivityCreate, byActor: ActorModel) {
  const activityObject = activity.object
  const activityType = activityObject.type

  if (activityType === 'Video') {
    return processCreateVideo(activity)
  }

  if (activityType === 'Note') {
    return retryTransactionWrapper(processCreateVideoComment, activity, byActor)
  }

  if (activityType === 'CacheFile') {
    return retryTransactionWrapper(processCreateCacheFile, activity, byActor)
  }

  if (activityType === 'Playlist') {
    return retryTransactionWrapper(processCreatePlaylist, activity, byActor)
  }

  logger.warn('Unknown activity object type %s when creating activity.', activityType, { activity: activity.id })
  return Promise.resolve(undefined)
}

// ---------------------------------------------------------------------------

export {
  processCreateActivity
}

// ---------------------------------------------------------------------------

async function processCreateVideo (activity: ActivityCreate) {
  const videoToCreateData = activity.object as VideoTorrentObject

  const { video, created } = await getOrCreateVideoAndAccountAndChannel({ videoObject: videoToCreateData })

  if (created) Notifier.Instance.notifyOnNewVideoIfNeeded(video)

  return video
}

async function processCreateCacheFile (activity: ActivityCreate, byActor: ActorModel) {
  const cacheFile = activity.object as CacheFileObject

  const { video } = await getOrCreateVideoAndAccountAndChannel({ videoObject: cacheFile.object })

  await sequelizeTypescript.transaction(async t => {
    return createOrUpdateCacheFile(cacheFile, video, byActor, t)
  })

  if (video.isOwned()) {
    // Don't resend the activity to the sender
    const exceptions = [ byActor ]
    await forwardVideoRelatedActivity(activity, undefined, exceptions, video)
  }
}

async function processCreateVideoComment (activity: ActivityCreate, byActor: ActorModel) {
  const commentObject = activity.object as VideoCommentObject
  const byAccount = byActor.Account

  if (!byAccount) throw new Error('Cannot create video comment with the non account actor ' + byActor.url)

  let video: VideoModel
  try {
    const resolveThreadResult = await resolveThread(commentObject.inReplyTo)
    video = resolveThreadResult.video
  } catch (err) {
    logger.debug(
      'Cannot process video comment because we could not resolve thread %s. Maybe it was not a video thread, so skip it.',
      commentObject.inReplyTo,
      { err }
    )
    return
  }

  const { comment, created } = await addVideoComment(video, commentObject.id)

  if (video.isOwned() && created === true) {
    // Don't resend the activity to the sender
    const exceptions = [ byActor ]

    await forwardVideoRelatedActivity(activity, undefined, exceptions, video)
  }

  if (created === true) Notifier.Instance.notifyOnNewComment(comment)
}

async function processCreatePlaylist (activity: ActivityCreate, byActor: ActorModel) {
  const playlistObject = activity.object as PlaylistObject
  const byAccount = byActor.Account

  if (!byAccount) throw new Error('Cannot create video playlist with the non account actor ' + byActor.url)

  await createOrUpdateVideoPlaylist(playlistObject, byAccount, activity.to)
}
