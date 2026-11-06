FROM node:22-bookworm-slim

# git for the main-branch push, ca-certificates for --use-system-ca fetches (PHIVOLCS chain)
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# PHIVOLCS serves an incomplete chain (leaf only); this GlobalSign OV intermediate
# completes it. Works with the script's --use-system-ca flag too.
ENV NODE_EXTRA_CA_CERTS=/app/scripts/phivolcs-ca.pem

# CRLF-safe: run through bash so the shebang/line endings don't matter
ENTRYPOINT ["bash", "docker-entrypoint.sh"]
