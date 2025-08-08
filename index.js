const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
// const { ObjectId } = require('mongodb'); // Add this import if using MongoDB

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
    const commentsCollection=db.collection('comments')
    const upvotesCollection=db.collection('upvotes')

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
        req.user=decoded;
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

   
    


// Updated backend endpoint
app.put('/user', async (req, res) => {
  try {
    const user = req.body
    // console.log('User received:', user)

    if (!user.email) return res.status(400).send('Email is required')

    const filter = { email: user.email }
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne(filter)
    
    if (existingUser) {
      console.log('User already exists, not updating')
      return res.send({ 
        acknowledged: true, 
        message: 'User already exists',
        user: existingUser 
      })
    }

    // Only create new user if doesn't exist
    const newUser = {
      ...user,
      timestamp: Date.now()
    }

    const result = await usersCollection.insertOne(newUser)
    res.send(result)
    
  } catch (err) {
    console.error('Error saving user:', err)
    res.status(500).send('Failed to save user')
  }
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

    //get the featured products
    app.get('/featured-products', async(req,res)=>{
      const query={status:'featured'}
      const result=await productsCollection.find(query).toArray()
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
      const email=req.user.email;
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





 //api for normal user
 
 //upvote product

//  app.patch('/upvote-product/:id', async(req,res)=>{
 

//   try {
//      const productId=req.params.id;
//   const {user_email, user_name}=req.body;

//     // Validate required fields
//     if (!user_email) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'User email is required' 
//       });
//     }

//   const query={_id: new ObjectId(productId)}
//   const product=await productsCollection.findOne(query)

//    if (!product) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Product not found' 
//       });
//     }

//       // Check if user is trying to vote on their own product
//     if (product.creator_email === user_email) {
//       return res.status(403).json({ 
//         success: false, 
//         message: 'You cannot vote on your own product' 
//       });
//     }

//     //check  if user already upvoted
//     const existingVote=await upvotesCollection.findOne({product_id: productId });

//     if(existingVote?.upvoted_by?.includes(user_email)){
//       return res.status(409).json({
//         success:false,
//         message:'You Already Upvoted this product'
//       })
//     }

//     const updateOperation={
//       $inc:{vote_count:1}
//     }

//     const result=await productsCollection.updateOne(query, updateOperation)

//        if (result.modifiedCount === 0) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Failed to add vote' 
//       });
//     }

//     const updatedProduct=await productsCollection.findOne(query, {projection:{vote_count:1}})

//         res.status(200).json({
//       success: true,
//       message: 'Vote added successfully',
//       data: {
//         product_id: id,
//         total_votes: updatedProduct.vote_count || 0
//       }
//     });

//     // res.send(result,updatedProduct)
    
//   } catch (error) {
//      console.error('Error in upvote endpoint:', error);
//     res.status(500).json({ 
//       success: false, 
//       message: 'Internal server error',
//       error: error.message 
//     });
//   }


//  })

// app.patch('/upvote-product/:id', verifyToken, async(req,res)=>{
//   const productId=req.params.id;
//   const{user_email}=req.body;

//   const existing=await upvotesCollection.findOne({productId})

//   if(!existing){
//     await upvotesCollection.insertOne({
//       productId,
//       upvoted_by:[user_email]
//     });

//     return res.send({toggled:true, message:'upvoted'})
//   }

//   const hasUpvoted=existing.upvoted_by.includes(user_email);

//   if(hasUpvoted){
//     await upvotesCollection.updateOne(
//       {productId},
//       {$pull:{upvoted_by:user_email}}
//     );

//      return res.send({ toggled: false, message: 'Upvote removed' });

//   }else{
//      await upvotesCollection.updateOne(
//       { productId },
//       { $addToSet: { upvoted_by: user_email } }
//     );
//     return res.send({ toggled: true, message: 'Upvoted' });
//   }



// })

// app.patch('/upvote-product/:id', async(req,res)=>{

//  try {
  
//    const productId=req.params.id;
//   const {user_name, user_email}=req.body;

//   const query={productId: productId};
//   const product=await upvotesCollection.findOne(query);

//   if(!product){
//     await upvotesCollection.insertOne({
//       productId:productId,
//       upvotedBy:[user_email]
//     });
//     return res.send({success:true, message:'upvoted successfully!'})
//   }

//   if(product.upvotedBy.includes(user_email)){
//     return res.send({success:false, message:'You Already upvoted this product'})
//   }

//   await upvotesCollection.updateOne(
//     {productId:productId},
//     {$push:{upvotedBy:user_email}}
//   );

//       res.send({ success: true, message: 'Upvoted successfully!' });

//  } catch (error) {
//       console.error(error);
//     res.status(500).send({ success: false, message: 'Server error.' });
  
//  }

  
  




// })

// Toggle Upvote Endpoint
app.patch('/upvote-product/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const { user_email } = req.body;

    if (!user_email) {
      return res.status(400).send({ success: false, message: 'User email is required.' });
    }

    // Check if already upvoted
    const existing = await upvotesCollection.findOne({ productId });

    if (existing && existing.upvotedBy?.includes(user_email)) {
      // Already upvoted → remove upvote
      await upvotesCollection.updateOne(
        { productId },
        { $pull: { upvotedBy: user_email } }
      );
      return res.send({ success: true, message: 'Upvote removed.' });
    } else {
      // Not yet upvoted → add upvote
      await upvotesCollection.updateOne(
        { productId },
        { $addToSet: { upvotedBy: user_email } }, // $addToSet avoids duplicates
        { upsert: true } // create if doesn't exist
      );
      return res.send({ success: true, message: 'Upvoted successfully!' });
    }

  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Server error.' });
  }
});


app.get('/upvotes-collection', async(req,res)=>{
  const result=await upvotesCollection.find().toArray();
  res.send(result)
})

app.get('/upvotes-collection/:id', async(req,res)=>{

  try {
    
     const productId=req.params.id;

  const userEmail=req.query.user_email;

  const query={productId: productId};
  const result=await upvotesCollection.findOne(query)

  const upvotedBy=result?.upvotedBy || [];

  const totalUpvotes=upvotedBy.length;
  const hasUpvoted=userEmail ? upvotedBy.includes(userEmail) : false


  res.send({totalUpvotes, hasUpvoted})

  } catch (error) {
     console.error(error);
    res.status(500).send({ message: 'Failed to fetch upvotes' });
    
  }
 
})



// GET all products


// app.get('/products', async (req, res) => {
//   try {
//     const products = await productsCollection.find({}).toArray();

//     res.status(200).json({
//       success: true,
//       message: 'Products retrieved successfully',
//       data: products
//     });

//   } catch (err) {
//     console.error('Get products error:', err);
//     res.status(500).json({ 
//       success: false,
//       message: 'Internal server error',
//       ...(process.env.NODE_ENV === 'development' && { error: err.message })
//     });
//   }
// });


 //comment
 app.post('/comments',verifyToken, async(req,res)=>{
  const {productId, commentText, userName, userPhoto}=req.body;
  console.log(req.user);
  
  const userEmail=req.user.email;
  console.log(userEmail);
  
  const newComment={
    productId,
    userName,
    userEmail,
    userPhoto,
    commentText,
    createdAt: new Date()
  };

  const result=await commentsCollection.insertOne(newComment);
  res.send(result)

  

 })

 //get the comments

 app.get('/comments/:productId', async(req,res)=>{
  const productId=req.params.productId;
  const comments=await commentsCollection.find({productId}).sort({createdAt:-1}).toArray();

  res.send(comments)
 })
   
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

// api for admin

    app.get('/users', async(req,res)=>{
      const result=await usersCollection.find().toArray();
      res.send(result);
    })


app.patch('/update-role/:email', async(req,res)=>{
  const email=req.params.email;
  console.log(req.body);
  
  const{role}=req.body;
  // console.log(newRole);
  
  const query={email: email}
  const updatedDoc={
    $set:{
      role: role
    }
  }

  const result=await usersCollection.updateOne(query, updatedDoc)
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
