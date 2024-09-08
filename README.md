<h1 align="center">
<img  width="350" src="https://sf16-scmcdn-sg.ibytedtos.com/goofy/tiktok/web/node/_next/static/images/logo-whole-c555aa707602e714ec956ac96e9db366.svg" alt="ionTok">
    <br>
    Tik-Eth-Tok
</h1>


> Note: TikEthTok was tested using the MetaMask mobile wallet on Android and iOS devices.  Other wallets may malfunction, or not work at all.

## Preview

<div align="center">
 <img alt="home"  title="home" src="img/image_1.png" style=" width: 25%;"/>
 <img alt="home"  title="home" src="img/image_2.png" style=" width: 25%;"/>
 <img alt="dicsover"  title="dicsover" src="img/image_3.png" style=" width: 25%;"/>
 <img alt="activity"  title="activity" src="img/image_4.png" style=" width: 25%;"/>
 <img alt="profile"  title="profile" src="img/image_5.png" style=" width: 25%;"/>
 <img alt="setting"  title="setting" src="img/image_6.png" style=" width: 25%;"/>
</div>



## Running the application locally

<p>To run the application, you must first follow the steps below</p>

* Download **python3**, **nodeJS**, **npm** and **docker** including **docker-compose **cli.

* Download ionic cli.
 ~~~
npm install -g @ionic/cli
 ~~~

* Download the project from this repository.
* Go to the download location of the project.

 ~~~
cd vendor/github.com/eaabak/ionTok
 ~~~

* Install node packages

~~~ 
npm install 
~~~

* Run this command to run the front end locally
~~~
ionic serve --external
~~~

<p>Start the web3auth server</p>

* Open a new **terminal**, and go to the download location of the project.

 ~~~
cd web3auth
 ~~~

* Run these commands to run the web3auth server.

~~~
npm install
npm run start
# or
cd w3a-example
yarn
yarn start
~~~

<p>OPTIONAL: Start the database and backend server</p>

* NOTE:  running the database and server requires SSL certificates. You will need docker, docker-compose, python3 and python venv installed. Open a new **terminal**, and go to the download location of the project.

 ~~~
./setup.sh
 ~~~

* Run these commands to run the database and backend server.

~~~
source ./showcase/bin/activate
cd server
docker-compose up -d
python3 server.py
~~~
