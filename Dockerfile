FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/db.js ./db.js
COPY --from=builder /app/uploads ./uploads
COPY --from=builder /app/data.db ./data.db
EXPOSE 3000
CMD ["npm", "start"]
