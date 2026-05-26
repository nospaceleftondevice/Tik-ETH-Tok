import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule)
  },
  {
    path: 'home',
    loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'discover',
    loadChildren: () => import('./pages/discover/discover.module').then(m => m.DiscoverPageModule)
  },
  {
    path: 'add-video',
    loadChildren: () => import('./pages/add-video/add-video.module').then(m => m.AddVideoPageModule)
  },
  {
    path: 'inbox',
    loadChildren: () => import('./pages/inbox/inbox.module').then(m => m.InboxPageModule)
  },
  {
    path: 'profile',
    loadChildren: () => import('./pages/profile/profile.module').then(m => m.ProfilePageModule)
  },
  {
    path: 'discover',
    loadChildren: () => import('./pages/discover/discover.module').then(m => m.DiscoverPageModule)
  },
  {
    path: 'settings-and-privacy',
    loadChildren: () => import('./pages/settings-and-privacy/settings-and-privacy.module').then(m => m.SettingsAndPrivacyPageModule)
  },
  {
    // Lazy-loaded matrix page. Reachable directly via /matrix or via a
    // future link from the home page. Calls GET /sessions/<name>/matrix
    // (defined in music-k8s backend); the SPA route name `matrix` doesn't
    // collide with any backend path because backend paths sit under
    // /sessions/<name>/matrix.
    path: 'matrix',
    loadChildren: () => import('./pages/matrix/matrix.module').then(m => m.MatrixPageModule)
  }
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
