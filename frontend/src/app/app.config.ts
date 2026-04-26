import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './services/auth.interceptor';
import { 
  provideLucideIcons, 
  LayoutDashboard, 
  Users, 
  Shield, 
  User, 
  CreditCard, 
  RefreshCw, 
  LogOut, 
  HelpCircle, 
  Save, 
  Zap, 
  Play, 
  Square, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp,
  Mail,
  CheckCircle2,
  AlertCircle
} from 'lucide-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideLucideIcons({
      LayoutDashboard, 
      Users, 
      Shield, 
      User, 
      CreditCard, 
      RefreshCw, 
      LogOut, 
      HelpCircle, 
      Save, 
      Zap, 
      Play, 
      Square, 
      ExternalLink, 
      ChevronDown, 
      ChevronUp,
      Mail,
      CheckCircle2,
      AlertCircle
    })
  ]
};
