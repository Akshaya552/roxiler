const express = require('express');
const app = express();
const path = require("path");
const bcrypt = require("bcryptjs");
const { open } = require("sqlite");
const sqlite3 = require('sqlite3');

const cors = require("cors");
const jwt = require("jsonwebtoken");
app.use(express.json());
app.use(cors());

let db = null;
const dbPath = path.join(__dirname, "storerating.db");
 
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(4000, () => {
      console.log("Server Running at http://localhost:4000");
    });
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
};

initializeDbAndServer();

app.post("/newuser", async (req, res) => {
  const { name, email,password,address,role} = req.body;
    const selectUserQuery = `SELECT * FROM users WHERE email LIKE '${email}';`
    const dbUser = await db.get(selectUserQuery);   
    if(dbUser===undefined){
      const hashedPassword = await bcrypt.hash(password, 10);
      const addNewUserQuery = `INSERT INTO Users (name, email, password, address, role) VALUES
        ('${name}', '${email}', '${hashedPassword}', '${address}', '${role}');`;
      await db.run(addNewUserQuery);
      res.send({message:"Registration Success"});
    }else{
      res.status(400)
      res.send({message: 'Email Already Registered'})
    }
  
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const selectUserQuery = `SELECT * FROM users WHERE email LIKE '${email.toLowerCase()}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    res.status(400).send({message:"Email Not Registered"});
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        email: email.toLowerCase()
      };
      const jwtToken = jwt.sign(payload, "AUTHENTICATION_TOKEN");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send({message:"Invalid Password"});
    }
  }
});


app.get('/allcount', async(req,res)=>{
    const allUsersQuery = `SELECT count(*) as users FROM Users WHERE role in ('Normal User','Store Owner');`;
    const allRatingsQuery = `SELECT count(*) as ratings FROM Ratings;`;
    const allStoresQuery = `SELECT count(*) as stores FROM Stores;`;
    const users = await db.get(allUsersQuery);
    const ratings = await db.get(allRatingsQuery);
    const stores = await db.get(allStoresQuery);
    res.send([users, ratings,stores]);
});

app.get('/users', async (req, res) => {
  const { name, email, address } = req.query;
  let { role } = req.query;
  if (!role) {
    role = ["Store Owner", "Normal User"];
  } else if (!Array.isArray(role)) {
    role = [role];
  }
  const placeholders = role.map(() => "?").join(", ");
  const usersQuery = `
SELECT 
  u.name, 
  u.email, 
  u.address, 
  u.role,
  CASE 
    WHEN u.role = 'Store Owner' THEN ROUND(AVG(r.rating), 2)
    ELSE NULL
  END AS rating
FROM users u
LEFT JOIN ratings r ON u.id = r.user_id
LEFT JOIN stores s ON r.store_id = s.id
WHERE u.name LIKE '%${name}%' 
  AND u.address LIKE '%${address}%' 
  AND u.email LIKE '%${email}%'
  AND u.role IN (${placeholders})
GROUP BY u.id;
`;
const users = await db.all(usersQuery, role);
res.send(users);
});


app.get('/stores',async(req,res)=>{
  const{name,address,rating} = req.query;
  const storesQuery = `SELECT name,email,address,ROUND(avg(ratings.rating),2) as stars FROM stores JOIN ratings on stores.id = ratings.store_id WHERE name LIKE '%${name}%' AND address LIKE '%${address}%' GROUP BY name HAVING stars>=${rating};`
  const stores = await db.all(storesQuery);
  res.send(stores);
});

app.patch('/passwordupdate/:userId/',async(req,res)=>{
  const {password} = req.body;
  const {userId} = req.params;
  const hashedPassword = await bcrypt.hash(password, 10);
  const patchingQuery = `UPDATE users SET password='${hashedPassword}' WHERE id=${userId};`;
  await db.run(patchingQuery);
  res.send(`Password Updated Successfully`);
});

app.get('/userdata/:userId/',async(req,res)=>{
  const {userId} =req.params;
  const userStoresView = `SELECT s.id AS store_id, s.name AS store_name, s.email AS store_email, s.address AS store_address, ROUND(AVG(r_all.rating), 2) AS average_rating, r_user.rating AS user_rating
  FROM stores s LEFT JOIN ratings r_all ON s.id = r_all.store_id LEFT JOIN ratings r_user ON s.id = r_user.store_id AND r_user.user_id = ${userId} GROUP BY s.id;`
  const userView = await db.all(userStoresView);
  res.send(userView);
});

app.put('/update-rating/:userId/:storeId/', async(req, res) => {
  const { userId,storeId}=req.params;
  const{rating} = req.body;
  const query = `
    UPDATE ratings
    SET rating = ${rating}
    WHERE user_id = ${userId} AND store_id = ${storeId};
  `;
  await db.run(query)
    res.send({ message: 'Rating updated successfully' });
});

app.get('/storeOwner/:storeId/',async(req,res)=>{
  const {storeId} = req.params;
  const avgRating = `SELECT ROUND(AVG(rating),2) as avg_rating from ratings WHERE store_id = ${storeId};`;
  const ratingStore = await db.get(avgRating);
  const storeOwnerQuery = `SELECT * FROM users JOIN ratings WHERE ratings.store_id=${storeId} GROUP BY user_id;`;
  const allusers = await db.all(storeOwnerQuery);
  res.send([ratingStore,allusers]);
});

