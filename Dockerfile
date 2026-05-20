FROM node:20-alpine
# Goes to the app directory
WORKDIR /app
# Copies our package.json and package-lock.json
COPY package*.json ./
# Install our dependencies
RUN npm install
# Copy the rest of our app into the container
COPY . .
EXPOSE 3001

CMD ["node", "home.js"]