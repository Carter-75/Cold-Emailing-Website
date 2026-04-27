import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './services/auth.interceptor';
import { 
  LUCIDE_ICONS, 
  LucideIconProvider,
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
  AlertCircle,
  Lock,
  ArrowRight,
  Search,
  Send,
  CheckCircle,
  MessageSquare
} from 'lucide-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
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
        AlertCircle,
        Lock,
        ArrowRight,
        Search,
        Send,
        CheckCircle,
        MessageSquare
      })
    }
  ]
};
