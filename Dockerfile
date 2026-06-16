FROM node:20-bookworm-slim AS node-runtime

FROM collabora/code:latest

USER root
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY collabora/no-welcome.js /usr/share/coolwsd/browser/dist/welcome/welcome.js
COPY collabora/no-welcome.html /usr/share/coolwsd/browser/dist/welcome/welcome.html
COPY collabora/minimal-view.css /tmp/minimal-view.css
COPY collabora/minimal-view.css /usr/share/coolwsd/browser/dist/minimal-view.css
COPY collabora/minimal-view.js /usr/share/coolwsd/browser/dist/minimal-view.js
COPY collabora/preview-branding.js /usr/share/coolwsd/browser/dist/preview-branding.js
COPY collabora/dark-theme-init.js /usr/share/coolwsd/browser/dist/dark-theme-init.js
COPY collabora/patch-collabora.js /tmp/patch-collabora.js
COPY scripts/start-all.sh /usr/local/bin/start-all.sh

RUN node /tmp/patch-collabora.js \
  && cat /tmp/minimal-view.css >> /usr/share/coolwsd/browser/dist/bundle.css \
  && mkdir -p /data \
  && chown -R cool:cool /app /data /usr/share/coolwsd/browser/dist/welcome /usr/share/coolwsd/browser/dist/minimal-view.css /usr/share/coolwsd/browser/dist/minimal-view.js /usr/share/coolwsd/browser/dist/preview-branding.js /usr/share/coolwsd/browser/dist/dark-theme-init.js \
  && chmod +x /usr/local/bin/start-all.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV PUBLIC_URL=http://localhost:3000
ENV WOPI_PUBLIC_URL=http://localhost:3000
ENV COLLABORA_INTERNAL_URL=http://127.0.0.1:9980
ENV COLLABORA_PUBLIC_URL=http://localhost:9980
ENV aliasgroup1=http://localhost:3000
ENV username=admin
ENV password=admin
ENV COLLABORA_MEMPROPORTION=95.0
ENV COLLABORA_LOAD_TIMEOUT_SECS=600
ENV COLLABORA_CONVERT_TIMEOUT_SECS=600
ENV COLLABORA_CONNECTION_TIMEOUT_SECS=120
ENV COLLABORA_WOPI_MAX_FILE_SIZE=0
ENV COLLABORA_PER_DOCUMENT_MAX_FILE_SIZE_MB=0
ENV COLLABORA_PER_DOCUMENT_MAX_VIRT_MEM_MB=0
ENV COLLABORA_BAD_DOC_MEMORY_MB=8192
ENV extra_params="--o:ssl.enable=false --o:ssl.termination=false --o:welcome.enable=false --o:net.frame_ancestors=* --o:net.post_allow.host[0]=.*"

EXPOSE 3000 9980

USER root
ENTRYPOINT ["/usr/local/bin/start-all.sh"]
