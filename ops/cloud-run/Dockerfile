# syntax=docker/dockerfile:1.7
FROM node:22.18-bookworm-slim AS runtime

COPY --chown=node:node lib /app/lib
WORKDIR /app/lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/web-services-section/services/capability-marketplace-services-section/services/federated-capability-offer-discovery-cell
RUN npm install -g npm@11 \
    && rm -f package-lock.json \
    && npm install --omit=dev --install-links \
    && npm cache clean --force \
    && node --check bin/server.mjs

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
 \
    CAPABILITY_OFFER_DISCOVERY_DATA_ROOT=/var/lib/capability-offer-discovery/settlement \
    SETTLEMENT_CAIP2=eip155:5615610
USER node
EXPOSE 8080
CMD ["node", "bin/server.mjs"]
