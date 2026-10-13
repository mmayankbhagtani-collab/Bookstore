require('dotenv').config();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_EMAIL = process.env.STORE_EMAIL;


const express = require('express');
const app = express()
const port = 3000
const crypto = require('crypto');

const mongoose = require('mongoose');
const multer = require('multer');
const nodemailer = require('nodemailer');
const session = require('express-session');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
})

const upload = multer({ storage: storage });

const transport = nodemailer.createTransport({
    service: process.env.SMTP_SERVICE,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
    
});

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
}
main()
.then(() => {console.log('Connected to MongoDB')})
.catch(err => console.log(err));

const bookSchema = new mongoose.Schema({
    title: String,
    author: String,

    price: Number,
    category: String,
    image: String
})

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    customer: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true }
    },
    deliveryAddress: {
        address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true }
    },
    payment: { type: String, required: true },
    items: [{
        title: { type: String, required: true },
        author: { type: String, default: 'Unknown' },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        subtotal: { type: Number, required: true }
    }],
    totalItems: { type: Number, required: true },
    totalAmount: { type: Number, required: true }
}, { timestamps: true });

const contactSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true }
}, { timestamps: true });


app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
}))
app.use((req, res, next) => {
    res.locals.isAdmin = Boolean(req.session.isAdmin);
    next();
})
app.use(express.urlencoded({ extended: true }))

function isAdmin(req, res, next) {
    if(req.session.isAdmin) {
        next();
    } else {
        res.send('Access Denied');
    }
}

app.get('/admin/login', (req, res) => {
    res.render('adminlogin.ejs');
})
app.post('/admin/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.redirect('/books');
    } else {
        res.send("Invalid Username or Password");
    }
});
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
})

const Book = mongoose.model('Book', bookSchema);
const Order = mongoose.model('Order', orderSchema);
const Contact = mongoose.model('Contact', contactSchema);



app.set("view engine", "ejs")
app.use(express.static('public'))


app.get('/', (req, res) => {
    res.render('home.ejs')
})

app.get('/about', (req, res) => {
    res.render('about.ejs')
})

app.get('/books', async (req, res) => {
    const books = await Book.find();
    res.render('books.ejs', { books, isAdmin: req.session.isAdmin});
})

app.get('/admin/orders', isAdmin, async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.render('orders.ejs', { orders });
});

app.get('/admin/contacts', isAdmin, async (req, res) => {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.render('admincontacts.ejs', { contacts });
});

app.post('/admin/contacts/delete/:id', isAdmin, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).send('Invalid contact message ID.');
    }

    const deletedContact = await Contact.findByIdAndDelete(req.params.id);
    if (!deletedContact) {
        return res.status(404).send('Contact message not found.');
    }

    res.redirect('/admin/contacts');
});

app.post('/admin/orders/delete/:id', isAdmin, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).send('Invalid order ID.');
    }

    const deletedOrder = await Order.findByIdAndDelete(req.params.id);
    if (!deletedOrder) {
        return res.status(404).send('Order not found.');
    }

    res.redirect('/admin/orders');
});

app.get('/books/new', isAdmin, (req, res) => {
    res.render('newbook');
});

app.post('/books', isAdmin, upload.single('img'), async (req, res) => {
    const book = new Book({
        title: req.body.title,
        author: req.body.author,
        price: req.body.price,
        category: req.body.category,
        image: '/uploads/' + req.file.filename
    });

    await book.save();
    res.redirect('/books');
});

app.post('/books/delete/:id', isAdmin, async (req, res) => {
    const id = req.params.id;
    await Book.findByIdAndDelete(id);
    res.redirect('/books');
});

app.get('/books/edit/:id',isAdmin, async (req, res) => {
    const Id = req.params.id;
    const book = await Book.findById(Id);
    res.render('editbook', { book });
});
app.post('/books/edit/:id', isAdmin, upload.single('img'), async (req, res) => {
    const book = await Book.findById(req.params.id);

    if (req.body.title) book.title = req.body.title;
    if (req.body.author) book.author = req.body.author;
    if (req.body.price) book.price = req.body.price;
    if (req.body.category) book.category = req.body.category;

    if (req.file) {
        book.image = '/uploads/' + req.file.filename;
    }

    await book.save();
    res.redirect('/books');
});

app.get('/categories', async (req, res) => {
    const books = await Book.find();
    const categories = [...new Set(books.map(book => book.category))];
    res.render('categories.ejs', { books, categories, isAdmin: req.session.isAdmin });
});

app.get('/categories/:category', async (req, res) => {
    const category = req.params.category;
    const books = await Book.find({ category: category });

    const allBooks = await Book.find();
    const categories = [...new Set(allBooks.map(book => book.category))];
    res.render('categories.ejs', { books, categories, isAdmin: req.session.isAdmin });
});


app.get('/contact',(req, res) => {
    res.render('contact.ejs', { submitted: req.query.sent === '1' })
});

app.post('/contact', async (req, res) => {
    const { name, email, mobile, message } = req.body;
    if (![name, email, mobile, message].every(value => typeof value === 'string' && value.trim())) {
        return res.status(400).send('Please fill in all contact details.');
    }

    const savedContact = await Contact.create({
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        message: message.trim()
    });

    try {
        await transport.sendMail({
            from: STORE_EMAIL,
            to: STORE_EMAIL,
            replyTo: savedContact.email,
            subject: 'New contact message - The Book Store',
            text: `Name: ${savedContact.name}\nEmail: ${savedContact.email}\nMobile: ${savedContact.mobile}\nMessage: ${savedContact.message}`
        });
    } catch (error) {
        console.error('Contact notification email error:', error);
        return res.status(502).send('Your message was saved, but the store email notification could not be sent. You may contact us again if needed.');
    }

    res.redirect('/contact?sent=1');
});

app.get('/cart', (req, res) => {
    res.render('cart');
});

app.get('/checkout', (req, res) => {
    res.render('checkout.ejs');
});

app.post('/checkout', async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            pincode,
            address,
            city,
            state,
            payment,
            cartData
        } = req.body;
        const orderId = 'ORD-' + crypto.randomUUID();

        if (
            !name || !email || !phone || !pincode ||
            !address || !city || !state || !payment
        ) {
            return res.status(400).send('Please fill in all required details.');
        }

        if (
            !/^[0-9]{10}$/.test(phone) ||
            !/^[0-9]{6}$/.test(pincode) ||
            !['Cash on Delivery', 'UPI', 'Debit/Credit Card'].includes(payment)
        ) {
            return res.status(400).send('Please enter valid details.');
        }

        let cart;

        try {
            cart = JSON.parse(cartData);
        } catch (error) {
            return res.status(400).send('Invalid cart information.');
        }

        if (!Array.isArray(cart) || cart.length === 0 || cart.length > 100) {
            return res.status(400).send('Your cart is empty.');
        }

        let totalAmount = 0;
        let totalItems = 0;

        const items = cart.map(book => {
            const title = String(book.title || 'Book').slice(0, 200);
            const author = String(book.author || 'Unknown').slice(0, 100);
            const price = Number(book.price);
            const quantity = Number(book.quantity) || 1;

            if (
                !Number.isFinite(price) || price < 0 ||
                !Number.isInteger(quantity) ||
                quantity < 1 || quantity > 100
            ) {
                throw new Error('Invalid book price or quantity.');
            }

            const subtotal = price * quantity;

            totalAmount += subtotal;
            totalItems += quantity;

            return { title, author, price, quantity, subtotal };
        });

        await Order.create({
            orderId,
            customer: { name, email, phone },
            deliveryAddress: { address, city, state, pincode },
            payment,
            items,
            totalItems,
            totalAmount
        });

        const orderDetails = items.map(item => `
                Book: ${item.title}
                Author: ${item.author}
                Price: Rs. ${item.price.toFixed(2)}
                Quantity: ${item.quantity}
                Subtotal: Rs. ${item.subtotal.toFixed(2)}
                `).join('\n');

await transport.sendMail({
    from: STORE_EMAIL,
    to: STORE_EMAIL,
    replyTo: email,
    subject: `New Order - The Book Store | ${orderId}`,
text: `
NEW BOOK ORDER
            
Order ID: 
${orderId}

CUSTOMER DETAILS:

Name: ${name}
Email: ${email}
Phone: ${phone}

DELIVERY ADDRESS: ${address}
City: ${city}
State: ${state}
PIN Code: ${pincode}

PAYMENT PREFERENCE: ${payment}

ORDER DETAILS: ${orderDetails}

Total Items: ${totalItems}
Total Amount: Rs. ${totalAmount.toFixed(2)}
`
});

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
                <title>Order Submitted</title>
            </head>

            <body class="flex min-h-screen items-center justify-center bg-[#f6f3ed] p-6">
                <div class="max-w-lg rounded-3xl bg-white p-10 text-center shadow-xl">
                    <div class="text-6xl">📚</div>

                    <h1 class="mt-2 text-1xl font-bold text-[#17202a]">
                        Order Submitted!
                    </h1>

                    <p class="mt-4 font-semibold text-[#a47c43]">
                        YourOrder ID: ${orderId}
                    </p>

                    <p class="mt-4 text-gray-600">
                        Thank you for shopping with The Book Store.
                        Your order details have been emailed to the store.
                    </p>

                    <p class="mt-4 text-xl font-bold text-[#a47c43]">
                        Total: Rs. ${totalAmount.toFixed(2)}
                    </p>

                    <a href="/books"
                        class="mt-7 inline-block rounded-xl bg-[#17202a] px-6 py-3 font-bold text-white hover:bg-[#d8b77a] hover:text-[#101820]">
                        Continue Shopping
                    </a>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Checkout email error:', error);

        res.status(500).send(
            'Unable to submit your order. Please check the server and email configuration.'
        );
    }
});


app.post('/upi-payment', (req, res) => {
    try {
        const orderId = 'ORD-' + crypto.randomUUID();
        const {
            name, email, phone, pincode,
            address, city, state, payment, cartData
        } = req.body;

        if (
            !name || !email || !phone || !pincode ||
            !address || !city || !state ||
            payment !== 'UPI' || !cartData
        ) {
            return res.status(400).send('Please enter all required details.');
        }

        if (
            !/^[0-9]{10}$/.test(phone) ||
            !/^[0-9]{6}$/.test(pincode)
        ) {
            return res.status(400).send('Invalid phone number or PIN code.');
        }

        const cart = JSON.parse(cartData);

        if (!Array.isArray(cart) || cart.length === 0 || cart.length > 100) {
            return res.status(400).send('Your cart is empty or invalid.');
        }

        let totalAmount = 0;

        for (const book of cart) {
            const price = Number(book.price);
            const quantity = Number(book.quantity);

            if (
                !Number.isFinite(price) || price < 0 ||
                !Number.isInteger(quantity) || quantity < 1 || quantity > 100
            ) {
                return res.status(400).send('Invalid cart item.');
            }

            totalAmount += price * quantity;
        }

        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return res.status(400).send('Invalid payment amount.');
        }

        const upiId = '8949241005@ptsbi';
        const upiLink =
            `upi://pay?pa=${encodeURIComponent(upiId)}` +
            `&pn=${encodeURIComponent('The Book Store')}` +
            `&am=${totalAmount.toFixed(2)}` +
            '&cu=INR' +
            `&tn=${encodeURIComponent('Book Store Order')}`;

        res.render('upi-payment.ejs', {
            orderId,
            totalAmount,
            upiId,
            upiLink,
            cartData: JSON.stringify(cart),
            customer: {
                name,
                email,
                phone,
                pincode,
                address,
                city,
                state
            }
        });

    } catch (error) {
        console.error('UPI page error:', error);
        res.status(400).send('Unable to open the payment page.');
    }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});