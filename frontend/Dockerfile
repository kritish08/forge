# Stage 1: Build the React Application
FROM node:20-alpine AS build

WORKDIR /app

# The backend URL is inlined into the bundle at BUILD time, so it must be passed
# as a build arg — a runtime `env_file` on the nginx container is far too late.
# compose.yaml supplies this from DOMAIN_NAME. (Named VITE_* since the CRA ->
# Vite migration; source maps are disabled in vite.config.js.)
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

# Copy manifest + lockfile first so dependency installs stay cached across code
# changes. --frozen-lockfile makes the build reproducible: it fails rather than
# silently resolving a different tree than the one committed.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy application code
COPY . .

# Fail loudly instead of shipping a bundle with no API host.
#
# THIS IS NOT HYPOTHETICAL: the build live in production on 2026-09-08 was
# compiled with this variable unset, so every request resolved to
# /undefined/api/... , hit the SPA fallback and came back as HTML with a 200.
# Nobody could sign in. It shipped because nothing checked.
RUN test -n "$VITE_BACKEND_URL" || \
      (echo "ERROR: build arg VITE_BACKEND_URL is empty — the bundle would have no API host." \
       && echo "       Build via 'docker compose build' (compose.yaml supplies it from DOMAIN_NAME)," \
       && echo "       or pass --build-arg VITE_BACKEND_URL=https://api-<your-domain>" && exit 1)

# Build for production
RUN yarn build

# Assert on the OUTPUT, not just the input.
#
# Checking the variable was passed is necessary but not sufficient — a value can
# be present and still not reach the bundle. So verify the built JS actually
# contains the host and carries no "undefined/api". The bug is not always a
# greppable literal: the previous toolchain minified it to `void 0+"/api"`,
# concatenated at runtime, which a naive grep misses completely. The positive
# check is the one that cannot be fooled.
RUN set -eu; \
    if ! grep -rqF "$VITE_BACKEND_URL" build/static/js; then \
      echo "ERROR: built bundle does not contain '$VITE_BACKEND_URL'."; \
      echo "       The API host did not reach the build. Refusing to ship it."; \
      exit 1; \
    fi; \
    if grep -rq "undefined/api" build/static/js; then \
      echo "ERROR: built bundle contains 'undefined/api'. Refusing to ship it."; \
      exit 1; \
    fi; \
    echo "OK: bundle targets $VITE_BACKEND_URL"

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Configure Nginx for React Router (SPA fallback + correct caching / real 404s)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
