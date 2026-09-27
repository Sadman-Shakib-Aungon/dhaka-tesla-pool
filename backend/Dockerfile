FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .

# Prisma needs a URL only to load its config while generating the client.
ENV DATABASE_URL="postgresql://pool_user:pool_password@db:5432/dhaka_tesla_pool?schema=public"
RUN ./node_modules/.bin/prisma generate

EXPOSE 4000
CMD ["npm", "run", "start"]
