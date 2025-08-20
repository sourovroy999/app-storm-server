

const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const { ObjectId } = require('mongodb'); // Add this import if using MongoDB

const port = process.env.PORT || 8000



// middleware
const corsOptions = {
  origin:
    ['http://localhost:5173',
      'http://localhost:5174',
      'https://appstorm-c52b2.web.app'

    ],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

// For webhook verification, raw body is needed for that route
app.use((req, res, next) => {
    if (req.originalUrl === '/webhook') {
        express.raw({ type: 'application/json' })(req, res, next);
    } else {
        express.json()(req, res, next);
    }
});

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
    const db = client.db('appStorm')
    const productsCollection = db.collection('products')
    const usersCollection = db.collection('users')
    const reportsCollection = db.collection('reports')
    const commentsCollection = db.collection('comments')
    const upvotesCollection = db.collection('upvotes')
    const reviewsCollection = db.collection('reviews')

    // console.log(productsCollection);


    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '10d'
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        })
        .send({ success: true })

    })

    const verifyToken = (req, res, next) => {


      const token = req.cookies.token;

      if (!token) {
        console.log('No token found in cookies'); // For debugging
        return res.status(401).send({ message: 'Unauthorized access - No token provided' });
      }

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'forbidden access' })
        }
        req.user = decoded;
        next()

      })

    }

    //stripe: payment subscription 


app.post('/create-subscription', verifyToken, async (req, res) => {
    try {
        const priceId = process.env.STRIPE_PRICE_ID;
        if (!priceId) {
            return res.status(400).json({ error: 'Price ID is required' });
        }

        const userEmail = req.user.email;
        console.log(userEmail, priceId);
        
        if (!userEmail) {
            return res.status(400).json({ error: 'User email is required' });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: userEmail,
            success_url: `${process.env.BASE_URL}`,
            cancel_url: `${process.env.BASE_URL}`,
            metadata: { email: userEmail }
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


app.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const email = session.customer_email || session.metadata?.email;
            if (email) {
                await usersCollection.updateOne(
                    { email },
                    { $set: { membership: 'premium', status: 'verified' } }
                );
                console.log('✅ Subscription started and user updated:', email);
            }
            break;
        }
        case 'invoice.paid': {
            const invoice = event.data.object;
            const email = invoice.customer_email || invoice.metadata?.email;
            if (email) {
                await usersCollection.updateOne(
                    { email },
                    { $set: { membership: 'premium', status: 'verified' } }
                );
                console.log('✅ Invoice paid, user verified:', email);
            }
            break;
        }
        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            const email = invoice.customer_email || invoice.metadata?.email;
            if (email) {
                await usersCollection.updateOne(
                    { email },
                    { $set: { membership: 'free', status: 'unverified' } }
                );
                console.log('❌ Payment failed, user downgraded:', email);
            }
            break;
        }
        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            const email = subscription.customer_email || subscription.metadata?.email;
            if (email) {
                await usersCollection.updateOne(
                    { email },
                    { $set: { membership: 'free', status: 'unverified' } }
                );
                console.log('❌ Subscription canceled, user downgraded:', email);
            }
            break;
        }
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
});







    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',

          })
          .send({ success: true })
        console.log('logout succsessfull');


      } catch (error) {
        res.status(500).send(error)
      }
    })



    app.put('/user', async (req, res) => {
      try {
        const user = req.body;

        if (!user.email) {
          return res.status(400).send('Email is required');
        }

        const filter = { email: user.email };

        // Check if user already exists
        const existingUser = await usersCollection.findOne(filter);

        if (existingUser) {
          // Update the existing user's name and photo
          const updateDoc = {
            $set: {
              name: user.name || existingUser.name,
              photoURL: user.photoURL || existingUser.photoURL,
              role: existingUser.role || 'guest',
              status: existingUser.status || 'unverified',
              updatedAt: Date.now(),
            },
          };

          const result = await usersCollection.updateOne(filter, updateDoc);
          return res.send({
            acknowledged: true,
            message: 'User updated',
            result,
          });
        }

        // Create a new user if they don't exist
        const newUser = {
          ...user,
          role: user.role || 'guest',
          status: user.status || 'unverified',
          createdAt: Date.now(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.send({
          acknowledged: true,
          message: 'User created',
          result,
        });

      } catch (err) {
        console.error('Error saving user:', err);
        res.status(500).send('Failed to save user');
      }
    });

    app.get("/subscription", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // First, check database
    let user = await usersCollection.findOne({ email });
    let membership = user?.membership || "free";

    // If DB says free/unverified, double-check with Stripe
    if (membership === "free" || !membership) {
      // Find Stripe customer by email
      const customers = await stripe.customers.list({ email });
      if (customers.data.length > 0) {
        const customerId = customers.data[0].id;

        // Check if they have an active subscription
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
        });

        if (subscriptions.data.length > 0) {
          membership = "premium";
        }
      }
    }

    res.json({ membership });
  } catch (err) {
    console.error("Error fetching subscription:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



    app.get('/user/:email', async (req, res) => {
      const email = req.params.email
      const query = { email };
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

    app.get('/products', async (req, res) => {
      const query = { status: { $nin: ["rejected", "pending"] } }
      const products = await productsCollection.find(query).toArray()
      res.send(products);
    })



    //get a single product data
    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const product = await productsCollection.findOne(query)

      if (!product) {
        return res.status(404).send({ message: 'Product not found' });
      }

      // Block if status is rejected or pending
      // if (product.status === 'rejected' || product.status === 'pending') {
      //   return res.status(403).send({ message: 'Access to this product is restricted' });
      // }


      res.send(product);
    })
    //update product
    app.put('/products/update/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const productData = req.body;
        const email = req.user.email;

          // Optionally, check if the product belongs to the user
  const product = await productsCollection.findOne({ _id: new ObjectId(id) });
  if (!product || product.creator_email !== email) {
    return res.status(403).send({ message: 'Forbidden: You can only update your own products.' });
  }

      const query = { _id: new ObjectId(id) }



      const updateDoc = {
        $set: productData
      }

      const result = await productsCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    //delete a product
    app.delete('/products/delete/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await productsCollection.deleteOne(query)
      res.send(result)
    })

    //get the featured products
    app.get('/featured-products', async (req, res) => {
      const query = { status: 'featured' }
      const result = await productsCollection
      .find(query)
      .sort({uploadedAt:-1})
      .limit(4)
      .toArray()
      res.send(result)
    })

    //get the trending products

    app.get('/trending-products', async (req, res) => {
      try {
        const trending = await upvotesCollection.aggregate([
          {
            $project: {
              productId: 1,
              upvoteCount: { $size: "$upvotedBy" }
            }
          },
          {
            $sort: { upvoteCount: -1 }
          },
          {
            $limit: 5
          },
          {
            $addFields: {
              productObjId: { $toObjectId: "$productId" }
            }
          },
          {
            $lookup: {
              from: "products",
              localField: "productObjId",
              foreignField: "_id",
              as: "productData"
            }
          },
          {
            $unwind: "$productData"
          },
          {
            $match: {
              "productData.status": { $nin: ["rejected", "pending"] }
            }
          },
          {
            // Merge all product fields with upvoteCount at top level
            $replaceRoot: {
              newRoot: {
                $mergeObjects: ["$productData", { upvoteCount: "$upvoteCount" }]
              }
            }
          }
        ]).toArray();

        res.send(trending);
      } catch (err) {
        console.error("Error fetching trending products:", err);
        res.status(500).send("Failed to fetch trending products");
      }
    });


    // upload product data to the servers , add product

    app.post('/products', verifyToken, async (req, res) => {
      const product = req.body;
      const email=req.user.email;
      const query={creator_email: email};

      const user=await usersCollection.findOne({email});

      if(!user){
        return res.status(404).json({message:"User not found"})
      }

      const membership = user.membership || "free";

      if(membership !=='premium'){
        const existingProductsCount =await productsCollection.countDocuments(query);
            if (existingProductsCount >= 1) {
        return res.status(409).send({ error: "Free members can upload only one product" });
      }

      }


      // const uploadedProduct= productsCollection.find(query).toArray;

      product.uploadedAt=new Date()

      const result = await productsCollection.insertOne(product)
      res.send(result)
    })

    //get subscription status and total uploaded product


    //get products by email(for log in user)

    app.get('/my-products', verifyToken, async (req, res) => {
      const email = req.user.email;
      console.log(email)

      const query = { creator_email: email }

      const result = await productsCollection.find(query).toArray()
      res.send(result)
    })


    app.put('/products/reports', async (req, res) => {
      const reportDetails = req.body;
      const filter = { productId: reportDetails.productId };
      const updatedDoc = {
        $push: { reports: { ...reportDetails.reports[0] }, }
      }

      const options = { upsert: true };
      try {
        const result = await reportsCollection.updateOne(filter, updatedDoc, options);
        res.send(result)

      } catch (error) {
        console.error('Error updating reports:', error);
        res.status(500).send({ message: 'Failed to update reports' });
      }

    })

    //get all the reported list
    app.get('/product/reports', async (req, res) => {
      try {
        const result = await reportsCollection.aggregate([
          {
            $addFields: {
              productObjectId: { $toObjectId: "$productId" }
            }
          },
          {
            $lookup: {
              from: "products",
              localField: "productObjectId",
              foreignField: "_id",
              as: "ProductDetails"
            }
          },
          {
            $unwind: {
              path: "$ProductDetails",
              preserveNullAndEmptyArrays: false

            }
          },
          {
            $project: {
              productObjectId: 0
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


    app.get('/upvotes-collection', async (req, res) => {
      const result = await upvotesCollection.find().toArray();
      res.send(result)
    })

    app.get('/upvotes-collection/:id', async (req, res) => {

      try {

        const productId = req.params.id;

        const userEmail = req.query.user_email;

        const query = { productId: productId };
        const result = await upvotesCollection.findOne(query)

        const upvotedBy = result?.upvotedBy || [];

        const totalUpvotes = upvotedBy.length;
        const hasUpvoted = userEmail ? upvotedBy.includes(userEmail) : false


        res.send({ totalUpvotes, hasUpvoted })

      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch upvotes' });

      }

    })

    //post review



app.post('/submit-review', async (req, res) => {
  try {
    const { productId, userName, email, userPhoto, description, rating } = req.body;

    // Validate required fields
    if (!productId || !description || !rating || !email) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const newReview = {
      _id: new ObjectId(),
      userName,
      email,
      userPhoto,
      description,
      rating,
      createdAt: new Date(),
    };

    // Update or insert review safely
    const result = await reviewsCollection.updateOne(
      { productId },
      [
        {
          $set: {
            reviews: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ["$reviews", []] }, // ensure array
                    as: "rev",
                    cond: { $ne: ["$$rev.email", email] } // remove old review from same user
                  }
                },
                [newReview]
              ]
            }
          }
        }
      ],
      { upsert: true } // create document if not exist
    );

    res.json({ success: true, message: "Review saved successfully", result });

  } catch (error) {
    console.error("Submit Review Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});



    app.get('/product-review/:id', async (req, res) => {
  const productId = req.params.id;

  try {
    const result = await reviewsCollection.aggregate([
      { $match: { productId } },
      {
        $project: {
          productId: 1,
          reviews: {
            $sortArray: { input: "$reviews", sortBy: { createdAt: -1 } }
          }
        }
      }
    ]).toArray();

    res.send(result[0] || { productId, reviews: [] });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error fetching reviews" });
  }
});






    // GET all products




    //comment
    app.post('/comments', verifyToken, async (req, res) => {
      const { productId, commentText, userName, userPhoto } = req.body;
      console.log(req.user);

      const userEmail = req.user.email;
      console.log(userEmail);

      const newComment = {
        productId,
        userName,
        userEmail,
        userPhoto,
        commentText,
        createdAt: new Date()
      };

      const result = await commentsCollection.insertOne(newComment);
      res.send(result)



    })

    //get the comments

    app.get('/comments/:productId', async (req, res) => {
      const productId = req.params.productId;
      const comments = await commentsCollection.find({ productId }).sort({ createdAt: -1 }).toArray();

      res.send(comments)
    })

    //api for moderator

    //get all  products for moderator
    app.get('/products-for-reviews', async (req, res) => {
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
    app.patch('/product/status/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          status: status
        }
      }
      const result = await productsCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    // api for admin

    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    // app.get('/user-role-counts', async(req,res)=>{
    //   try{
    //     const counts=await usersCollection.aggregate([
    //       {
    //         $group:{
    //           _id:"$role",
    //           count:{$sum: 1}
    //         }
    //       }
    //     ]).toArray()

    //     //
    //     const roleCounts=counts.reduce((acc,item)=>{
    //       acc[item._id]=item.count;
    //       return acc
    //     }, {admin:0, moderator:0, guest:0})

    //     res.send(roleCounts)

    //     const premiumCount=await us

    //   } catch(err){
    //         console.error(err);
    // res.status(500).send({ error: "Failed to get role counts" });
    //   }
    // })

app.get('/user-stats', async (req, res) => {
  try {
    const aggregation = await usersCollection.aggregate([
      {
        $facet: {
          roles: [
            {
              $group: {
                _id: { $ifNull: ["$role", "unknown"] }, // Handle missing role
                count: { $sum: 1 }
              }
            }
          ],
          memberships: [
            {
              $group: {
                _id: { $ifNull: ["$membership", "free"] }, // Handle missing membership - default to "free"
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]).toArray();

    const result = { roles: {}, memberships: {} };
    
    if (aggregation[0]) {
      // Handle roles (including "unknown")
      aggregation[0].roles.forEach(r => {
        result.roles[r._id] = r.count;
      });
      
      // Handle memberships (including "free" default)
      aggregation[0].memberships.forEach(m => {
        result.memberships[m._id] = m.count;
      });
    }

    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to get user stats" });
  }
});


    app.patch('/update-role/:email', async (req, res) => {
      const email = req.params.email;
      console.log(req.body);

      const { role } = req.body;
      // console.log(newRole);

      const query = { email: email }
      const updatedDoc = {
        $set: {
          role: role
        }
      }

      const result = await usersCollection.updateOne(query, updatedDoc)
      res.send(result)



    })

    





    await client.connect();



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', async (req, res) => {
  res.send('Hello from appStorm server')
})

app.listen(port, () => {
  console.log(`appStorm is running on port ${port}`);

})
