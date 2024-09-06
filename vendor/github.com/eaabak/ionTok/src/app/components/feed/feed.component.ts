import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {AnimationOptions} from 'ngx-lottie';

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

  constructor() {
  }

  ngOnInit() {

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

  buttonClicked(button) {
    console.log("Button clicked: " + button)
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
  
}
