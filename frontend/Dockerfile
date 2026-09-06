# Stage 1: Build the React Application
FROM node:20-alpine AS build

WORKDIR /app

# The backend URL is inlined into the bundle at BUILD time by CRA, so it must be
# passed as a build arg — a runtime `env_file` on the nginx container is far too
# late. compose.yaml supplies this from DOMAIN_NAME.
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Don't ship source maps of the whole app to production.
ENV GENERATE_SOURCEMAP=false

# Copy manifest + lockfile first so dependency installs stay cached across code
# changes. --frozen-lockfile makes the build reproducible: it fails rather than
# silently resolving a different tree than the one committed.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy application code
COPY . .

# Fail loudly instead of shipping a bundle that calls "undefined/api/...".
RUN test -n "$REACT_APP_BACKEND_URL" || \
      (echo "ERROR: build arg REACT_APP_BACKEND_URL is empty — the bundle would have no API host." && exit 1)

# Build for production
RUN yarn build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Configure Nginx for React Router (SPA fallback + correct caching / real 404s)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
