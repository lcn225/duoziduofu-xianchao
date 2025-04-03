FROM node:latest

RUN mkdir -p /workspace

WORKDIR /workspace

RUN npm config set registry https://registry.npmmirror.com

RUN cd /workspace

RUN git clone https://github.com/KoWming/vue-idle-xiuxian . && \
    npm install -g pnpm && \
    pnpm install && \
    pnpm run build

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "8080"]