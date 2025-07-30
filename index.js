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
    const reportsCollection=db.collection('reports')

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

    //delete a product
    app.delete('/products/delete/:id', async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)}
      const result=await productsCollection.deleteOne(query)
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

  //report content api
  // app.patch('/product/report', async(req,res)=>{
  //   // const id=req.params.id;
  //   // const query={_id: new ObjectId(id)}
  //   const reportDetails=req.body
  //   const updateDoc={
  //     $set:{
  //       report:reportDetails
  //     }
  //   }
  // }) 
  
  app.put('/products/reports', async(req,res)=>{
    const reportDetails=req.body;
    const filter={productId: reportDetails.productId};
    const updatedDoc={
      $push:{reports:{...reportDetails.reports[0]},}
    }

    const options={upsert:true};
    try {
       const result=await reportsCollection.updateOne(filter, updatedDoc, options);
    res.send(result)
      
    } catch (error) {
        console.error('Error updating reports:', error);
    res.status(500).send({ message: 'Failed to update reports' });
    }
    

   

  })

  //get all the reported list
  app.get('/product/reports', async(req,res)=>{
    try {
      const result=await reportsCollection.aggregate([
        {
          $addFields:{
            productObjectId:{$toObjectId:"$productId"}
          }
        },
        {
          $lookup:{
            from:"products",
            localField:"productObjectId",
            foreignField:"_id",
            as:"ProductDetails"
          }
        },
        {
          $unwind:{
            path:"$ProductDetails",
            preserveNullAndEmptyArrays: false

          }
        },
        {
          $project:{
            productObjectId:0
          }
        }
      ]).toArray();
      res.send(result)

      
    } catch (error) {
          console.error('Error fetching reported products:', error);
    res.status(500).send({ error: 'Failed to fetch reported products' });

      
    }
     
  });

   
//api for moderator

//get all  products for moderator
app.get('/products-for-reviews', async(req, res) => {
  try {
    const result = await productsCollection.aggregate([
      {
        $addFields: {
          sortOrder: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "pending"] }, then: 1 },
                { case: { $eq: ["$status", "featured"] }, then: 2 },
                { case: { $eq: ["$status", "approved"] }, then: 3 },
                { case: { $eq: ["$status", "rejected"] }, then: 4 }
              ],
              default: 5
            }
          }
        }
      },
      { $sort: { sortOrder: 1 } },
      { $project: { sortOrder: 0 } } // Remove the temporary sortOrder field
    ]).toArray();
    
    res.send(result);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).send('Internal Server Error');
  }
});

// product status count

app.get('/product-status-counts', async (req, res) => {
  try {
    const countsRaw = await productsCollection.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const counts = countsRaw.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.send(counts);
  } catch (error) {
    console.error('Error getting product status counts:', error);
    res.status(500).send('Internal Server Error');
  }
});


//update approve status
app.patch('/product/status/:id', async(req,res)=>{
  const id=req.params.id;
  const{status}=req.body;
  const query={_id:new ObjectId(id)}
  const updateDoc={
    $set:{
      status: status
    }
  }
  const result=await productsCollection.updateOne(query, updateDoc)
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
