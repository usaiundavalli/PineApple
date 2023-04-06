const mongoose = require("mongoose");
// Database connection
// mongoose
//   .connect(process.env.DB_URL)
//   .then(() => console.log(" db Connected !...."))
//   .catch((err) => console.log(err.message));

const mailSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    uppercase: true,
  },
  phone: {
    type: Number,
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  subject: {
    type: String,
    default: `Report`,
  },
  bodyOfTheMail: {
    type: String,
    required: true,
  },
});

const mailModel = mongoose.model("Mail_Sender", mailSchema);
module.exports = mailModel;
