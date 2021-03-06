import { Component, ElementRef, ViewChild } from '@angular/core'
import { VideoDetails } from '../../../shared/video/video-details.model'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { I18n } from '@ngx-translate/i18n-polyfill'
import { Notifier } from '@app/core'

@Component({
  selector: 'my-video-download',
  templateUrl: './video-download.component.html',
  styleUrls: [ './video-download.component.scss' ]
})
export class VideoDownloadComponent {
  @ViewChild('modal', { static: true }) modal: ElementRef

  downloadType: 'direct' | 'torrent' = 'torrent'
  resolutionId: number | string = -1

  video: VideoDetails
  activeModal: NgbActiveModal

  constructor (
    private notifier: Notifier,
    private modalService: NgbModal,
    private i18n: I18n
  ) { }

  show (video: VideoDetails) {
    this.video = video

    this.activeModal = this.modalService.open(this.modal)

    this.resolutionId = this.video.files[0].resolution.id
  }

  onClose () {
    this.video = undefined
  }

  download () {
    window.location.assign(this.getLink())
    this.activeModal.close()
  }

  getLink () {
    // HTML select send us a string, so convert it to a number
    this.resolutionId = parseInt(this.resolutionId.toString(), 10)

    const file = this.video.files.find(f => f.resolution.id === this.resolutionId)
    if (!file) {
      console.error('Could not find file with resolution %d.', this.resolutionId)
      return
    }

    switch (this.downloadType) {
      case 'direct':
        return file.fileDownloadUrl

      case 'torrent':
        return file.torrentDownloadUrl
    }
  }

  activateCopiedMessage () {
    this.notifier.success(this.i18n('Copied'))
  }
}
