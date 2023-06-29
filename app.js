const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// custom API
//SELECT * FROM like
app.get("/want/", async (req, res) => {
  const getTable = `
    SELECT * FROM like;
    ;`;
  const dataArray = await db.all(getTable);
  res.send(dataArray);
});
app.delete("/user/:userId/", async (req, res) => {
  const { userId } = req.params;
  const deleteUser = `DELETE FROM user WHERE user_id = ${userId};`;
  await db.run(deleteUser);
  res.send("User Deleted");
});

// Register API 1

app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  let addUserQuery;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUser = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUser);
  //console.log(dbUser);
  if (dbUser === undefined) {
    if (password.length < 6) {
      res.status(400);
      res.send("Password is too short");
    } else {
      addUserQuery = `
        INSERT INTO
        user ( username, password, name, gender )
        VALUES (
            '${username}', 
            '${hashedPassword}', 
            '${name}', 
            '${gender}'
            );`;
      await db.run(addUserQuery);
      res.send("User created successfully");
    }
  } else {
    res.status(400);
    res.send("User already exists");
  }
});

// Login API 2

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const selectUser = `
     SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUser);
  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_CODE");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

const authenticateToken = async (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_CODE", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

// get latest tweets of people API 3

app.get("/user/tweets/feed/", authenticateToken, async (req, res) => {
  const { username } = req;
  //console.log(username);
  //const username = "SrBachchan";
  const getTweetsQuery = `
  SELECT u2.username, t.tweet, date_time AS dateTime
  FROM user u1
  INNER JOIN follower f 
  INNER JOIN tweet t
  INNER JOIN user u2
  ON u1.user_id = f.follower_user_id 
  AND f.following_user_id = t.user_id
  AND t.user_id = u2.user_id
  WHERE u1.username = '${username}'
  ORDER BY dateTime DESC
  LIMIT 4;`;
  // LIMIT 4
  const tweetArray = await db.all(getTweetsQuery);
  res.send(tweetArray);
});

// get follow names API 4

app.get("/user/following/", authenticateToken, async (req, res) => {
  const { username } = req;
  const getFollowingsQuery = `
  SELECT u2.name
  FROM user u1
  INNER JOIN follower f
  INNER JOIN user u2
  ON u1.user_id = f.follower_user_id AND f.following_user_id = u2.user_id
  WHERE u1.username = '${username}';`;
  const followsArray = await db.all(getFollowingsQuery);
  res.send(followsArray);
});

// get followers API 5

app.get("/user/followers/", authenticateToken, async (req, res) => {
  const { username } = req;
  const getFollowingsQuery = `
  SELECT u1.name
  FROM user u2
  INNER JOIN follower f
  INNER JOIN user u1
  ON u2.user_id = f.following_user_id AND f.follower_user_id = u1.user_id
  WHERE u2.username = '${username}';`;
  const followsArray = await db.all(getFollowingsQuery);
  res.send(followsArray);
});

// API 6 - get tweets
// tweet ids -- 1, 2, 7, 8 for JoeBiden-- users -- 1, 4
app.get("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  //const username = "SrBachchan";
  //const username = "JoeBiden";
  const getTweetQuery = `
  SELECT tweet,
  (SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) AS likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) AS replies,
  date_time AS dateTime
  FROM user u INNER JOIN follower f
  INNER JOIN tweet t
  ON u.user_id = f.follower_user_id AND f.following_user_id = t.user_id
  WHERE u.username = '${username}' AND tweet_id = ${tweetId};`;
  const tweetData = await db.get(getTweetQuery);
  //AND f.following_user_id = t.user_id
  // AND t.tweet_id = ${tweetId}
  //(SELECT tweet_id  FROM tweet WHERE tweet_id = ${tweetId})
  //console.log(tweetData);
  if (tweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send(tweetData);
  }
});

// API 7 - get tweet likes by names

/* app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  //const username = "SrBachchan";
  //const username = "JoeBiden";
  const getNamesQuery = `
  SELECT name 
  FROM like l NATURAL JOIN user u  
  WHERE l.tweet_id = ${tweetId}
  ORDER BY name ASC ;`;
  const namesArray = await db.all(getNamesQuery);
  //console.log(namesArray);
  const names = namesArray.map((each) => each.name);
  //console.log(names);
  const likesObj = { likes: names };
  //console.log(likesObj);
  const getTweetQuery = `
  SELECT 
    (SELECT uu.name FROM like l NATURAL JOIN user uu  WHERE l.tweet_id = ${tweetId} ) AS likes
  FROM 
    user u 
    INNER JOIN follower f
    INNER JOIN tweet t
    ON u.user_id = f.follower_user_id 
    AND f.following_user_id = t.user_id
  WHERE 
    u.username = '${username}' AND tweet_id = ${tweetId};`;
  const tweetData = await db.all(getTweetQuery);
  console.log(tweetData);
  if (tweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send(likesObj);
  }
}); */

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const { user_id } = await db.get(getUserId);
    const checkTheTweetUser = `
  	  SELECT * FROM tweet INNER JOIN follower on tweet.user_id =   
      follower.following_user_id
      WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;

    const tweet = await db.get(checkTheTweetUser);
    if (tweet === undefined) {
      /*send Invalid Request as response along with the status*/
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikesUserQuery = `
          	SELECT user.username
          	FROM user INNER JOIN like ON like.user_id = user.user_id
          	WHERE like.tweet_id = ${tweetId};`;
      const likeUserInformation = await db.all(getLikesUserQuery);
      const likes = likeUserInformation.map((user) => {
        return user["username"];
      });
      response.send({ likes }); /*Sending the required response*/
    }
  }
);

// API 8 -- get tweet replies

/* app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  //const username = "SrBachchan";
  //const username = "JoeBiden";
  const getNamesQuery = `
  SELECT name, reply FROM reply l NATURAL JOIN user u  WHERE l.tweet_id = ${tweetId};`;
  const namesArray = await db.all(getNamesQuery);
  //console.log(namesArray);
  //const names = namesArray.map((each) => each.name);
  //console.log(names);
  const repliesObj = { replies: namesArray };
  //console.log(likesObj);
  const getTweetQuery = `
  SELECT tweet_id
  FROM user u INNER JOIN follower f
  INNER JOIN tweet t
  ON u.user_id = f.follower_user_id AND f.following_user_id = t.user_id
  WHERE u.username = '${username}' AND tweet_id = ${tweetId};`;
  const tweetData = await db.all(getTweetQuery);
  if (tweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send(repliesObj);
  }
}); */

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const { user_id } = await db.get(getUserId);
    const checkTheTweetUser = `
  	  SELECT * FROM tweet INNER JOIN follower ON tweet.user_id =   
      follower.following_user_id
      WHERE tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${user_id};`;

    const tweet = await db.get(checkTheTweetUser);
    if (tweet === undefined) {
      /*send Invalid Request as response along with the status*/
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getReplyUserQuery = `
          	SELECT user.username AS name, reply.reply AS reply
          	FROM user INNER JOIN reply ON user.user_id = reply.user_id
          	WHERE reply.tweet_id = ${tweetId};`;
      const replies = await db.all(getReplyUserQuery);
      //   const replies = replyUserInformation.map((user) => {
      //     return user["username"];
      //   });
      response.send({ replies }); /*Sending the required response*/
    }
  }
);

// API 9 -- get user all tweets

app.get("/user/tweets/", authenticateToken, async (req, res) => {
  const { username } = req;
  //const username = "SrBachchan";
  //const username = "JoeBiden";
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserId);
  const getTweetsQuery = `
  SELECT 
    tweet,
    (SELECT COUNT() FROM like WHERE tweet_id = t.tweet_id) AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = t.tweet_id) AS replies,
    date_time AS dateTime
  FROM tweet t
  WHERE t.user_id = ${user_id} 
    ORDER BY dateTime DESC;`;
  /*const getTweetsQuery = `
  SELECT 
  tweet,
  (SELECT COUNT() FROM like WHERE tweet_id = t.tweet_id) AS likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = t.tweet_id) AS replies,
  date_time AS dateTime
  FROM user u
  INNER JOIN follower f
  INNER JOIN tweet t
  ON u.user_id = f.follower_user_id
  AND f.following_user_id = t.user_id
  WHERE u.username = '${username} 
  ORDER BY dateTime DESC;`; */
  const tweetData = await db.all(getTweetsQuery);
  if (tweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send(tweetData);
  }
});

// API 10 -- create tweet

app.post("/user/tweets/", authenticateToken, async (req, res) => {
  const { username } = req;
  const { tweet } = req.body;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserId);
  //console.log(user_id);
  const createTweetQuery = `
    INSERT INTO 
      tweet (tweet, user_id)
    VALUES ('${tweet}', ${user_id}); `;
  await db.run(createTweetQuery);
  res.send("Created a Tweet");
});

// API 11 -- delete tweet

app.delete("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserId);
  const deleteTweetQuery = ` 
  DELETE FROM tweet 
  WHERE 
    user_id = ${user_id}
    AND tweet_id = ${tweetId};`;
  const getTweetQuery = `
    SELECT * FROM tweet 
    WHERE 
      user_id = ${user_id} 
      AND tweet_id = ${tweetId};`;
  const tweetData = await db.get(getTweetQuery);
  //console.log(tweetData);
  if (tweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    await db.run(deleteTweetQuery);
    res.send("Tweet Removed");
  }
});

module.exports = app;
