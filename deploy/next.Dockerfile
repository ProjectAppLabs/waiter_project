# POS o menú del comensal (Next.js). Los reenvíos a experience se fijan al compilar: por eso van como argumentos.
FROM node:24-slim AS build
WORKDIR /app
ARG EXPERIENCE_ORIGIN
ENV EXPERIENCE_ORIGIN=$EXPERIENCE_ORIGIN NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
