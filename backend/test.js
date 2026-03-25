require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await User.find();
  console.log(JSON.stringify(users, null, 2));
  mongoose.disconnect();
}).catch(console.error);
