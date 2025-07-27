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

     const verifyToken=(req,res,next)=>{
  

      const token=req.cookies.token;

       if (!token) {
        console.log('No token found in cookies'); // For debugging
        return res.status(401).send({ message: 'Unauthorized access - No token provided' });
    }
      
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err,decoded)=>{
        if(err){
          return res.status(401).send({message: 'forbidden access'})
        }
        req.decoded=decoded;
        next()

      })

    }

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

      const isExist=await usersCollection.findOne(query)

      if(isExist){
        if (user.status === 'requested') {
          const result=await usersCollection.updateOne(query,{
            $set:{status: user?.status}
          })
          return res.send(result)

        }
        else{
          return res.send(isExist)
        }
      }

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

    app.get('/user/:email', async(req,res)=>{
      const email=req.params.email
      const query={email};
      const result=await usersCollection.findOne(query)
      res.send(result)
    })

    app.get('/products', async(req,res)=>{
      const products=await productsCollection.find().toArray()
      res.send(products);
    })

    //get a single product data
    app.get('/products/:id', async(req,res)=>{
      const id= req.params.id;
      const query={_id: new ObjectId(id)}
      const result=await productsCollection.findOne(query)
      res.send(result);
    })
     //update product
    app.put('/products/update/:id', async(req,res)=>{
        const id= req.params.id;
        const productData=req.body;
      const query={_id: new ObjectId(id)}

      const updateDoc={
        $set:productData
      }

      const result=await productsCollection.updateOne(query, updateDoc)
      res.send(result)
    })


    // upload product data to the servers

    app.post('/products', async(req,res)=>{
      const product=req.body;
      const result=await productsCollection.insertOne(product)
      res.send(result)
    })

    //get products by email(for log in user)

    app.get('/my-products',verifyToken,  async(req,res)=>{
      const email=req.decoded.email;
      console.log(email)
      
      const query={creator_email:email}

      const result=await productsCollection.find(query).toArray()
      res.send(result)
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
