import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('auth_token');
  const isApi = req.url.includes('/api');
  
  console.log(`[Interceptor] Request: ${req.method} ${req.url} | Token Found: ${!!token} | Is API: ${isApi}`);

  if (token && isApi) {
    const cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(cloned);
  }
  
  return next(req);
};
