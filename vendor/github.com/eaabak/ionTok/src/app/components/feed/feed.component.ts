import { Component, Input, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { IonSlides } from '@ionic/angular';
import { DataService } from '../../services/data.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-feed',
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.scss'],
})
export class FeedComponent implements OnInit, OnDestroy {
  @Input() videos: any[] = []; // List of videos
  @ViewChild('slides', { static: false }) slides: IonSlides;

  currentVideo: any = null; // Track the currently active video
  private ws: WebSocket | null = null;

  constructor(private data: DataService, private http: HttpClient) {}

  ngOnInit() {
    this.initializeWebSocket();
  }

  ngOnDestroy() {
    this.closeWebSocket();
  }

  private initializeWebSocket(): void {
    const websocketUrl = 'wss://dastream.cloud/ws';
    this.ws = new WebSocket(websocketUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connection established.');
    };

    this.ws.onmessage = (event) => {
      const message = event.data;
      console.log('WebSocket message received:', message);

      if (message === 'like' && this.currentVideo) {
        this.buttonClicked('likes', this.currentVideo.id);
      }
    };

    this.ws.onclose = () => {
      console.warn('WebSocket connection closed.');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private closeWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async onSlideDidChange(): Promise<void> {
    if (!this.slides) {
      console.error('IonSlides reference is not available.');
      return;
    }

    try {
      const activeIndex = await this.slides.getActiveIndex();
      this.currentVideo = this.videos[activeIndex]; // Update the current video
      console.log('Active slide changed. Current video:', this.currentVideo);
    } catch (error) {
      console.error('Error getting active slide index:', error);
    }
  }

  buttonClicked(button: string, video_id: number): void {
    console.log('Button clicked:', button);
    console.log('Video id:', video_id);

    if (button === 'likes') {
      console.log('Performing like action for video:', video_id);
    }

    // Handle other button actions here...
  }
}
