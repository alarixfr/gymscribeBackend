# GYMSCRIBE BACKEND
This is the backend for gymscribe, an open source gym membership management app
https://github.com/alarixfr/gymscribe

# HOW TO RUN THE SERVER
NOTE: skip steps if you already done it on your device before

## Setup
1. Install Node.js (https://nodejs.org/)
2. Install Git (https://git-scm.com/download/)
3. Install VS Code/other code editor (https://code.visualstudio.com/)
4. Create project folder (anywhere)
5. Open the project folder in VS Code/other code editor
6. Clone this repo:
```
git clone https://github.com/alarixfr/gymscribeBackend.git .
```

## Install dependencies
```
npm install
```

## Create Neon database
1. Go to https://neon.tech/
2. Create account/login
3. Create project
4. Pick closest/any region
5. Copy the connection string

## Create ENV
1. Create new `.env` file inside the project folder
2. Copy, paste and edit this template:
```
# Database
DATABASE_URL="paste_your_neon_url_here"

# JWT Secret (change this to random string)
JWT_SECRET="random-string-change-this-abcdef"

# Altcha Secret (for CAPTCHA)
ALTCHA_SECRET="random-string-change-this-abcdef"

# Port (optional, defaults to 8080)
PORT=8080
```

## Initialize database
```
npx prisma generate
```
then
```
npx prisma migrate dev --name init
```

## Start the server
```
npm start
```

## DONE 🎉
you can host this server locally or use a vps and edit the frontend to match the correct backend url.

<h1>FLAVORTOWN</h1>
<p>This project was shipped in flavortown with total of 100 hours including the backend.</p>
<a href="https://flavortown.hackclub.com/projects/32">https://flavortown.hackclub.com/projects/32</a>
<hr>
<img style="width:30%;" src="https://raw.githubusercontent.com/hackclub/flavortown/refs/heads/main/app/assets/images/orpheus_sprites/12.png" alt="Flavortown">
<br></br>
<p style="font-size:2rem">Welcome! :&#41</p>
<h2>If you are reviewing this project:</h2>
<p>there are some stuff you might want to know,<p/>
<ol>
<li>This project uses AI for fixing bugs and help me implement features that are hard to do especially in the backend, however i still type the code myself.</li>
<li>This project uses vanilla CSS with some libraries for the frontend styling, this is hard to do because all styling need to be written manually.</li>
</ol>
<h2>For the fraud department:</h2>
<p>Thanks for viewing my project, if you guys found something suspicious in my project, just wanted to say that I always check how the ui looks with changes written in the css styling because I want the ui looks as good as I want. Another thing for you guys to know that I DID NOT do <i>time inflation</i> on purposes, my first project was flagged with no valid reasons, hope you guys know I commits too often because of this, haha.</p>
<hr>
<p style="float:left">
  <img width="49%" src="https://assets.hackclub.com/flag-standalone.svg" alt="Hack Club">
  <img width="49%" src="https://raw.githubusercontent.com/hackclub/flavortown/refs/heads/main/app/assets/images/landing/hero/logo.webp" alt="Flavortown">
</p>

<h1>DONATE</h1>
<p>
BTC:
bc1que4da8sfzt25e2x72j9yx6vvxzepug97rszcls
</p>
<a href="https://paypal.me/alaricabyasa">
  <img src="https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white">
</a>
<p>Made by Alaric Abyasa</p>