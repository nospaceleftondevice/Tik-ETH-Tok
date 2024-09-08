import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
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

  option: AnimationOptions = {
    path: './assets/animations/music.json'
  };

  showSearchBar: boolean = false; // Variable to track the visibility of the search bar
  heartStyle: string = '';  // To dynamically change the heart icon color
  bookmarkStyle: string = '';  // To dynamically change the bookmark icon color

  constructor(private data: DataService, private http: HttpClient) {} // Inject HttpClient into the constructor

  ngOnInit() {}

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

  buttonClicked(button: string, video_id: number) {
    console.log("Button clicked: " + button);
    console.log("Video id: " + video_id);

    if (button === "bookmarks") {
      window.sessionStorage.removeItem('videoResults');
      window.sessionStorage.setItem('viewbookmarks',"true");
      if (window.localStorage.getItem('bookmarks') !== null)
        document.querySelector('ion-slides').slideTo(0); 
      return;
    }

    if (button === 'likes') {
      // Toggle the heart color (red when clicked)
      this.heartStyle = this.heartStyle === 'color: red;' ? '' : 'color: red;';
    } else if (button === 'comments') {
      // Toggle the bookmark color (black when clicked)
      this.bookmarkStyle = this.bookmarkStyle === 'color: black;' ? '' : 'color: black;';
      console.log(`[[[[[[[[[[ get id: ${video_id} ]]]]]]]]]]`);
      this.data.getVideo(`${video_id}`).subscribe((videos) => { console.log("videos sent from server: "); console.dir(videos) } );
    }

    // Get the account number from session storage
    const accountNumber = window.sessionStorage.getItem("account") || "000000"
    console.log("Account number: " + accountNumber);

    // Dynamically get the host and protocol, but use a different port (e.g., 7000)
    //const apiUrl = `${window.location.protocol}//${window.location.hostname}:7000/videos/${video_id}/${button}`;
    const apiUrl = `${window.location.protocol}//${window.location.hostname}/videos/${video_id}/${button}`;
    
    const payload = { account_number: accountNumber };


    // Send the POST request to the backend
    this.http.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe(
      response => {
        console.log('Request successful:', response);
      },
      error => {
        console.error('Request failed:', error);
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
    console.log('Searching for:', searchTerm);
  // Implement your search logic here
  }

}

