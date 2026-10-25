// Executed only when the MongoDB data volume is first initialized.
const app = db.getSiblingDB('closer');
app.createUser({user:'closer',pwd:process.env.MONGO_APP_PASSWORD,roles:[{role:'readWrite',db:'closer'}]});
