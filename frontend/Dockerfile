# Frontend — nginx serving the pure HTML/CSS/JS SPA.
# Copies public/app into the nginx document root and proxies /api → backend:8000.
FROM nginx:1.27-alpine

# Remove default site config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config (proxies /api to the backend service)
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Static SPA assets
COPY public/app /usr/share/nginx/html/app

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
