FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
# Seed scripts live at root level alongside src/
COPY *.js ./

EXPOSE 5000
CMD ["node", "src/server.js"]
