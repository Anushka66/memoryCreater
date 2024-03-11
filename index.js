import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import multer from 'multer';
import session from 'express-session';
import path from 'path';
import env from 'dotenv';

const app=express();
const port=3000;
env.config();

const db=new pg.Client({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
});
try{
    await db.connect();
    console.log("database connected");
}
catch{
    console.log("error in connecting server");
}
//db.connect();



// Multer configuration for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
//app.use(upload.single("image"));


app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.resolve("./public")));
app.set("view engine", "ejs");

app.use(session({         //middleware settings
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

app.get("/",(req,res)=>{
    res.render("home.ejs");
})

app.post("/redirect", async(req,res)=>{
    const action=req.body.action;
    if(action==='register'){
        res.render("register.ejs");
    }
    else{
        res.render("login.ejs");
    }
});


app.post("/register", async(req,res)=>{
    const name=req.body["username"];
    const email=req.body["email"];
    const password=req.body["password"];
    try{
        const existingUser=await db.query("SELECT * FROM users WHERE email=$1",[email]);

        if(existingUser.rows.length>0){
            res.render("register.ejs",{error: "Email already exists, use another email"});
        }
        else{
            await db.query("INSERT INTO users (name, email, password) VALUES ($1, $2, $3)",[name, email,password]);
            res.render("login.ejs");
        }
    }
    catch(error){
        console.error(error);
    }
});

app.post("/login", async(req,res)=>{
    const email=req.body["email"];
    const password=req.body["password"];
    try {
        const result=await db.query("SELECT * FROM users WHERE email=$1",[email]);
        if(result.rows.length>0){
            const userPassword=await db.query("SELECT password FROM users WHERE email=$1",[email]);
            const userPasswordRes=userPassword.rows[0].password;
            if(userPasswordRes!==password){
                res.send("Wrong email or password");
            }
            else{
                req.session.email=email;
                const userId=await db.query("SELECT id FROM users WHERE email=$1",[email]);
                const targetUserId=userId.rows[0].id;
                const answer=await db.query("SELECT * FROM memories WHERE user_id=$1",[targetUserId]);
                if(answer.rows.length>0){
                    res.render("index.ejs",{details:answer.rows, currentUser:result.rows[0].name});
                }
                else{
                    res.render("index.ejs");
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
});

app.post("/add",upload.single("image"),async(req,res)=>{
  const email=req.session.email;
  const title=req.body["title"];
  const content=req.body["content"];
  //const image=req.file.buffer;
  const image = req.file ? req.file.buffer : null;
  console.log(email);
  console.log(image);

  try{
    const userResult=await db.query("SELECT id FROM users WHERE email=$1",[email]);
    const nameResult=await db.query("SELECT * FROM users WHERE email=$1",[email]);
    if(userResult.rows.length>0){
        const userId=userResult.rows[0].id;
        console.log(userId);
        const result=await db.query("INSERT INTO memories (user_id, title, content, image) VALUES ($1, $2, $3, $4) RETURNING id",[userId, title, content,image]);
        const answer=await db.query("SELECT * FROM memories WHERE user_id=$1",[userId]);
        res.render("index.ejs",{details:answer.rows,currentUser:nameResult.rows[0].name});
    }
    else{
        res.send("User not found!!");
    }
  }
  catch(error){
    console.error(error);
  }
});


app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
        } else {
            res.redirect("/");
        }
    });
});


app.post("/delete", async (req, res) => {
    const email = req.session.email;
    const titleToDelete = req.body.memoryTitle;
    console.log(email);
    console.log(titleToDelete);

    try {
        const userResult = await db.query("SELECT id FROM users WHERE email=$1", [email]);
        const nameResult=await db.query("SELECT * FROM users WHERE email=$1",[email]);
        if (userResult.rows.length > 0) {
            const userId = userResult.rows[0].id;
            console.log(userId);

            const memoryResult = await db.query("SELECT id FROM memories WHERE user_id=$1 AND title=$2", [userId, titleToDelete]);

            if (memoryResult.rows.length > 0) {
                const memoryId = memoryResult.rows[0].id;
                console.log(memoryId);
                // Delete the image associated with the memory
                const imageResult = await db.query("SELECT image FROM memories WHERE id=$1", [memoryId]);
                const imageToDelete = imageResult.rows[0].image;

                // TODO: Delete the image from your storage or perform any other necessary actions.

                // Now delete the memory from the database
                await db.query("DELETE FROM memories WHERE id=$1", [memoryId]);

                // Fetch the updated list of memories after deletion
                const answer = await db.query("SELECT * FROM memories WHERE user_id=$1", [userId]);

                res.render("index.ejs", { details: answer.rows, currentUser:nameResult.rows[0].name});
            } else {
                res.send("Memory not found");
            }
        } else {
            res.send("User not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(port,()=>{
    console.log(`Server running on port ${port}`);
});


