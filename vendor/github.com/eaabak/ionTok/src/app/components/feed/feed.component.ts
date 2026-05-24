import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AnimationOptions } from 'ngx-lottie';
import { DataService } from "../../services/data.service";
import { HttpClient } from '@angular/common/http'; // Import HttpClient

@Component({
  selector: 'app-feed',
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.scss'],
})
export class FeedComponent implements OnInit {
  @Input() video: any;

  // Fires when the user taps a star on this feed's video. Parent
  // (home.page) tracks the videoIds it has heard from so the
  // scroll-past hook does not also record a 0 for the same video.
  @Output() rated = new EventEmitter<number>();

  option: AnimationOptions = {
    path: './assets/animations/music.json'
  };

  showSearchBar: boolean = false; // Variable to track the visibility of the search bar
  heartStyle: string = '';  // To dynamically change the heart icon color
  bookmarkStyle: string = '';  // To dynamically change the bookmark icon color
  remoteMode: boolean = false;

  // User's current rating for THIS video. 0 = not rated yet this page-load.
  // We don't fetch initial state from the server; reload resets to 0.
  userRating: number = 0;

  // Used by the template to render the star strip.
  readonly stars = [1, 2, 3, 4, 5];

  constructor(private data: DataService, private http: HttpClient) {} // Inject HttpClient into the constructor

  ngOnInit() {}

  // Tap-star handler. Records the rating and visually marks hearted (the
  // README spec says "selecting a star implies the video was hearted").
  // Last tap wins — the backend UPSERTs, so the user can change their mind.
  rateVideo(event: MouseEvent, stars: number) {
    event.stopPropagation();
    if (!this.video || this.video.id === undefined) {
      return;
    }
    this.userRating = stars;
    this.heartStyle = 'color: red;';   // visually mark hearted

    this.data.postRating(this.video.id, stars).subscribe(
      response => {
        console.log(`feed.component.ts: rateVideo ${stars}-star for video ${this.video.id} OK`, response);
      },
      error => {
        console.error(`feed.component.ts: rateVideo ${stars}-star for video ${this.video.id} failed`, error);
      }
    );

    // Tell the parent we have rated this video so its scroll-past hook
    // does not also fire a 0 for the same id.
    this.rated.emit(this.video.id);
  }

  getFirstLike(likes: string): number {
    return parseInt(likes.split(':')[0], 10) || 0;  // Get the first integer, or 0 if empty
  }

  getSecondLike(likes: string): number {
    return parseInt(likes.split(':')[1], 10) || 0;  // Get the second integer, or 0 if empty
  }

  formatNumber(value: number): string {
    if (value < 1000) {
      return value.toString(); // Print as is for numbers less than 1000
    } else if (value >= 1000 && value < 10000) {
      return (value / 1000).toFixed(1) + 'k'; // Print in the form of 1.0k
    } else if (value >= 10000 && value < 1000000) {
      return Math.floor(value / 1000) + 'k'; // Print in units of thousands (40k)
    } else {
      return (value / 1000000).toFixed(1) + 'm'; // Print in millions (1.2m)
    }
  }

  async remoteLike()
  {
      // Send the POST request to the backend
      this.http.get("https://dastream.cloud/like" 
      ).subscribe(
        response => {
          console.log('feed.component.ts: remoteLike Request successful:', response);
        },
        error => {
          console.error('feed.component.ts: remoteLike Request failed:', error);
        }
      );
  }

  buttonClicked(event: MouseEvent, button: string, video_id: number) {
    console.log("feed.component.ts: buttonClicked Button clicked: " + button);
    console.log("feed.component.ts: buttonClicked remoteLike Video id: " + video_id);
    console.log("feed.component.ts: buttonClicked isTrusted: " + event.isTrusted);
    const skipped = window.sessionStorage.getItem('skipped');

    if (button === "bookmarks") {
      window.sessionStorage.removeItem('videoResults');
      window.sessionStorage.setItem('viewbookmarks',"true");
      if (window.localStorage.getItem('bookmarks') !== null)
        document.querySelector('ion-slides').slideTo(0); 
      return;
    }

    if (button === 'likes') {
      // Toggle the heart color (red when clicked)
      const remote = window.sessionStorage.getItem('remote');
      console.log("feed.component.ts: buttonClicked Remote: " + remote);
      
      // If the click was not automated, do not mark the video as skipped on the following call to next_slide
      if (event.isTrusted && remote != 'true') {
        console.log("feed.component.ts: buttonClicked !! setting Mark As Skipped to false")
        window.sessionStorage.setItem('markasskipped','false')
        window.sessionStorage.setItem('skipBack','false')
        window.sessionStorage.setItem('account','droid')
      }
      else {
        console.log("feed.component.ts: buttonClicked !! setting Mark As Skipped to true")
        window.sessionStorage.setItem('markasskipped','true')
      }

      this.heartStyle = this.heartStyle === 'color: red;' ? '' : 'color: red;';
      if (remote == 'true') {
        this.remoteLike()
        return;
      }
      const audio = new Audio('https://your.cmptr.cloud/pageflip.mp3'); // Replace with your audio file URL
      audio.play().catch((error) => console.error('Audio playback failed:', error));

      // Modify the <video> element
      const videoElement = document.getElementById('float') as HTMLVideoElement;
      const searchElement = document.getElementById('search')

      if (videoElement) {
        videoElement.src = 'https://your.cmptr.cloud/pageflip.mp3'; // Update the video source
        videoElement.style.display = 'block'; // Make the video visible
        videoElement.play().catch((error) => console.error('Video playback failed:', error)); // Start playing the video
        searchElement.setAttribute("placeholder","${video_id}")
      }
    } else if (button === 'comments') {
      // Toggle the bookmark color (black when clicked)
      this.bookmarkStyle = this.bookmarkStyle === 'color: black;' ? '' : 'color: black;';
      console.log(`feed.component.ts: buttonClicked [[[[[[[[[[ get id: ${video_id} ]]]]]]]]]]`);
      this.data.getVideo(`${video_id}`).subscribe((videos) => { console.log("feed.component.ts: buttonClicked videos sent from server: "); console.dir(videos) } );
    }

    // Get the account number from session storage
    const accountNumber = window.sessionStorage.getItem("account") || "000000"
    console.log("feed.component.ts: buttonClicked Account number: " + accountNumber);

    // Dynamically get the host and protocol, but use a different port (e.g., 7000)
    //const apiUrl = `${window.location.protocol}//${window.location.hostname}:7000/videos/${video_id}/${button}`;
    const apiUrl = `${window.location.protocol}//${window.location.hostname}/videos/${video_id}/${button}`;
    
    const payload = { account_number: accountNumber };

    // Send the POST request to the backend
    this.http.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe(
      response => {
        console.log('feed.component.ts: buttonClicked Request successful:', response);
        window.localStorage.setItem('account','droid');
        document.querySelector('ion-slides').slideNext();
      },
      error => {
        console.error('feed.component.ts: buttonClicked Request failed:', error);
        window.localStorage.setItem('account','droid');
        document.querySelector('ion-slides').slideNext();
      }
    );
  }

  calculateRightOffset(value: number): string {
    const length = value.toString().length;

    if (length === 1) {
      return '-13px';
    } else if (length === 2) {
      return '-18px';
    } else if (length >= 3) {
      return '-22px';
    }

    return '-22px'; // Default to -22px if for some reason it's 0 or undefined
  }

  onSearch(event: any) {
    const searchTerm = event.target.value;
    console.log('feed.component.ts: onSearch Searching for:', searchTerm);
  // Implement your search logic here
  }

}

