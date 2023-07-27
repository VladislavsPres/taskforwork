const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const secretKey = '384fzS0ERU3N1IuaTxlHEvMkDcE4PzULf0yW2f9ntg5sJlpwhwsMnG7PnJIk7IRHTeL6a/bFsYLlHZnROpL1oA==';

const AWS = require('aws-sdk');
AWS.config.update({
  region: 'localhost',
  endpoint: 'http://localhost:8080',
  accessKeyId: 'fakeMyKeyId',
  secretAccessKey: 'fakeSecretAccessKey'
});
const documentClient = new AWS.DynamoDB.DocumentClient();

async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

async function createUsersTable() {
  const params = {
    TableName: 'Users',
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  };

  const dynamoDB = new AWS.DynamoDB();
  return await dynamoDB.createTable(params).promise();
}

async function checkUsersTable() {
  const dynamoDB = new AWS.DynamoDB();
  try {
    await dynamoDB.describeTable({ TableName: 'Users' }).promise();
    return true;
  } catch (error) {
    return false;
  }
}

async function initialize() {
  const hasUsersTable = await checkUsersTable();
  if (!hasUsersTable) {
    await createUsersTable();
    console.log('Users table created');
  } else {
    console.log('Users table already exists');
  }
}

initialize().then(() => {
  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  process.on('SIGINT', () => {
    console.log('Server is closing...');
    server.close(() => {
      console.log('Server successfully closed.');
      process.exit(0);
    });
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

function verifyToken(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }

    req.user = decoded;
    next();
  });
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const token = jwt.sign({ username }, secretKey, { expiresIn: '1h' });
  res.json({ token });
});

app.get('/secure-data', verifyToken, (req, res) => {
  const { username } = req.user;
  res.json({ message: 'This is secure data that requires authentication!', user: { username } });
});

app.post('/submit', verifyToken, async (req, res) => {
  const jsonData = req.body;
  console.log(jsonData);

  const { name, surname, password, id } = jsonData;

  const passwordHash = await hashPassword(password);

  const params = {
    TableName: 'Users',
    Item: {
      id: id,
      name: name,
      surname: surname,
      passwordHash: passwordHash
    }
  };

  await documentClient.put(params).promise();
  console.log('User saved to DynamoDB');
  res.send('User data received and saved to DynamoDB!');
});

app.get('/', (req, res) => {
  res.render('index', { message: 'Hello, Express!' });
});
