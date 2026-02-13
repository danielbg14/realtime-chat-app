# Use an official Node runtime as a parent image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies (use package-lock if present)
COPY package*.json ./
RUN npm install --omit=dev

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Use non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Default environment
ENV NODE_ENV=production

# Start the app
CMD ["node", "index.js"]
