const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')

const port = process.env.PORT || 8000

// middleware
const corsOptions = {
  origin:
   ['http://localhost:5173', 
    'http://localhost:5174',

 ],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iy6spfv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const db=client.db('appStorm')
    const productsCollection=db.collection('products')
    const usersCollection=db.collection('users')

    // console.log(productsCollection);
    

    app.post('/jwt', async(req,res)=>{
        const user=req.body;
        const token=jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn:'10d'
        } )
        res
        .cookie('token', token, {
          httpOnly:true,
          secure:process.env.NODE_ENV === 'production',
          sameSite:process.env.NODE_ENV === 'production' ? 'none' :'strict'
        })
        .send({success: true})

    })

    app.get('/logout', async(req,res)=>{
      try {
        res
        .clearCookie('token', {
          maxAge:0,
         secure:process.env.NODE_ENV === 'production',
          sameSite:process.env.NODE_ENV === 'production' ? 'none' :'strict',

        })
        .send({success: true})
        console.log('logout succsessfull');
        
        
      } catch (error) {
        res.status(500).send(error)
      }
    })

    


    app.put('/user', async(req,res)=>{
      const user=req.body;
      const query={email:user?.email}

      //save user for the first time
      const options={upsert: true}
      const updateDoc={
        $set:{
          ...user,
          timestamp: Date.now(),
        }
      }

      const result=await usersCollection.updateOne(query, updateDoc, options)
      res.send(result)


    })

    app.get('/products', async(req,res)=>{
      const products=await productsCollection.find().toArray()
      res.send(products);
    })

    //get a single product data
    app.get('/products/:id', async(req,res)=>{
      const id= new ObjectId(req.params.id);

      const result=await productsCollection.findOne(id)
      res.send(result);
    })

   


    
    
    await client.connect();



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', async(req,res)=>{
  res.send('Hello from appStorm server')
})

app.listen(port, ()=>{
  console.log(`appStorm is running on port ${port}`);
  
})
