// server.js
// where your node app starts

// init project
const express = require('express');
const bodyParser = require('body-parser');
const moment = require('moment');
const { body, check, validationResult } = require('express-validator/check');
const { sanitizeBody, matchedData } = require('express-validator/filter');
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('public'));

// init sqlite db
const fs = require('fs');
const dbFile = './.data/tables.db';
const exists = fs.existsSync(dbFile);
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    return console.error(err.message);
  }
  
  console.log('Connected to in-memory sqlite db');
}) ;

// if ./.data/sqlite.db does not exist, create it, otherwise print records to console
db.serialize(function(){
  if (!exists) {
    db.run('CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL)');
    db.run(`CREATE TABLE IF NOT EXISTS Exercises 
           (exercise_id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT, 
            duration INTEGER DEFAULT 0,
            date TEXT,
            user_id INTEGER,
            FOREIGN KEY(user_id) REFERENCES Users(id)
            )
          `);
    // insert default user
    db.serialize(function() {
      db.run('INSERT INTO Users (username) VALUES ("test")');
    });
    console.log("Added user");
  }
  else {
    console.log('Database ready to go!');
  }
});

//db async FUNCTIONS, inspired from https://gist.github.com/yizhang82/2ab802f1439490984eb998af3d96b16b
db.getAsync = (query) => {
  //let that = this;
  console.log("running GET query");
  return new Promise( (resolve, reject) => {
    db.get(query, (err, row) => {
      if (err) {
        console.log("Query failed");
        console.log(err);
        reject(err);
      }
      else {
        console.log("Successful DB Query");
        console.log(row);
        resolve(row); 
      }
    });
  });
};

db.allAsync = (query) => {
  return new Promise( (resolve, reject) => {
    db.all(query, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows); 
      }  
    });
  });
};

db.runAsync = (query) => {
  return new Promise( (resolve, reject) => {
    db.run(query, function(err) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        console.log("RUN query successful");
        resolve({id: this.lastID}); 
      }
    });
  });
};

const checkIDExist = (tableName, id) => {
  const existQuery = `SELECT id FROM ${tableName} WHERE id="${id}"`;
  return db.getAsync(existQuery);
};

const addUser = (username) => {
  //let data = {};
  console.log('test');
  const userQuery = `SELECT id FROM Users WHERE username="${username}"`;
  return db.getAsync(userQuery).then((row) => {
    console.log("should be here");
    console.log(row);
    if (!row) {
      console.log("No user, we will create an entry");
      const insertQuery = `INSERT INTO "Users" (username) VALUES ("${username}")`;
      return db.runAsync(insertQuery).then((res) => {
        return res;
      });
    } else {
      console.log('user has been taken');
      return {error: "username has been taken"};
    }
  }).then((data) => {
    console.log(data);
    return data;
  }).catch((error) => {
    console.log("Query failed?");
    return {error: error};
  });
};

const addExercise = (exercise) => {
  const userId = exercise.userId;
  const userQuery = `SELECT id FROM Users WHERE id="${userId}"`;
  return db.getAsync(userQuery).then((row) => {
    if (!row) {
      console.log("No user exists, there will be no entry");
      return {error: "Cant add exercise because userId does not exist"};
    } else {
      const userId = row['id'];
      const insertQuery = `INSERT INTO Exercises (description, duration, date, user_id)
                         VALUES ("${exercise.description}", "${exercise.duration}", "${exercise.date}", "${userId}")`;
      console.log(insertQuery);
      return db.runAsync(insertQuery).then((res) => {
        return {
          exercise_id: res.id
        };
      });
    }
  }).then((data) => {
    return data;
  }).catch((error) => {
    return {error:error};
  });
  // assume exercise has required_data, and validation happens before this function happened  
};

const getExercises = (query) => {
  // {userId}[&from][&to][&limit]
  return checkIDExist('Users',query.userId).then((row) => {
    if (!row) {
      return {error: "User ID does not exist"};
    } else {
      let exerciseQuery = `SELECT * FROM Exercises WHERE user_id="${query.userId}"`;
      if (query.limit) {
        exerciseQuery += `AND duration <= ${query.limit}`;
      };
      
      if (query.from) {
        exerciseQuery += `AND date >= ${query.from}`;
      }
      
      if (query.to) {
        exerciseQuery += `AND date <= ${query.to}`;  
      };
      console.log(exerciseQuery);
      return db.allAsync(exerciseQuery).then((rows) => {
        return {user_id: query.userId, exercises: rows};
      });
    };
  }).then((data) => {
    return data;
  }); 
};

// ROUTES
// http://expressjs.com/en/starter/basic-routing.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

app.get('/api/exercise/log', [
  check('userId')
    .isNumeric({gte: 1})
    .withMessage('userId must be a number'),
  check(['from', 'to'])
    .optional().isISO8601()
    .withMessage('Dates must be formatted as "YYYY-MM-DD"'),
  check('limit')
    .optional().isNumeric({gte: 1})
    .withMessage('Duration must be a number > 0')
], (req, res) => {
  //query format validation
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  const log = matchedData(req, { locations: ['query'] });
  
  return getExercises(log)
    .then((results) => {
      res.json(results)   
  }).catch((error) => {
      res.json(error)
  });
});

app.post('/api/exercise/new/user', [
  check('username')
    .isLength({max: 120})
    .withMessage('Username too long, please write something < 120 characters')
],(req, res) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  
  const username = req.body.username;
  addUser(username).then((results) => {
    console.log(results);
    res.json(results);
  }).catch((error) => {
    res.json(error);
  });
  // check if it exists in db or not
});

app.post('/api/exercise/add', [
  check('userId').isNumeric(),
  check('description').trim().escape(),
  check('duration')
    .isNumeric({gt: 0})
    .withMessage('Duration must be greater than 0!'),
], (req, res) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  
  const exercise = matchedData(req, { locations: ['body'] })
  addExercise(exercise).then((results) => {
    res.json(results);
  }).catch((error) => {
    res.json(error);
  });
});
// listen for requests :)
var listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
