# Gestion ERP - Server

This is the backend server for the Gestion ERP application, built with Node.js, Express, and MySQL.

## Prerequisites

- **Node.js**: Ensure you have Node.js installed (v14 or higher recommended).
- **MySQL**: A running MySQL database instance.

## Installation

1.  Clone the repository and navigate to the `server` directory.
2.  Install dependencies:

    ```bash
    npm install
    ```

## Configuration

Create a `.env` file in the root of the `server` directory with the following variables:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password

JWT_SECRET=your_jwt_secret_key
```

## Scripts

-   **Start Server**: Runs the server with `nodemon` for development.

    ```bash
    npm start
    ```

## API Endpoints

### Authentication (`/api/auth`)

-   **POST** `/login`: Authenticate a user and receive a JWT token.
    -   Body: `{ "email": "user@example.com", "password": "password" }`

### Users (`/api/users`)

*Requires Authentication and Authorization (Admin Role)*

-   **POST** `/create-user`: Create a new user.
    -   Body: `{ "nom": "Doe", "prenom": "John", "email": "john@example.com", "password": "password", "role": "admin" }`
-   **GET** `/all-users`: Retrieve a list of all users.
-   **GET** `/:id`: Retrieve a specific user by ID.
-   **PUT** `/:id`: Update a user's information.
-   **DELETE** `/:id`: Delete a user.

### Products (`/api/products`)

*Requires Authentication and Authorization (Admin Role)*

-   **POST** `/`: Create a new product.
    -   Body (multipart/form-data): `nom`, `prix`, `description`, `stock`, `stock_alert`, `code_barre`, `reference`, `id_point_de_vente`, `id_categorie`, `etat`, `photo` (file).
-   **GET** `/`: Retrieve all products with category and point of sale details.
-   **GET** `/:id`: Retrieve a specific product by ID.
-   **PUT** `/:id`: Update a product.
-   **DELETE** `/:id`: Delete a product.

### Categories (`/api/categories`)

*Requires Authentication and Authorization (Admin Role)*

-   **POST** `/`: Create a new category.
    -   Body: `{ "name": "Category Name" }`
-   **GET** `/`: Retrieve all categories.
-   **GET** `/:id`: Retrieve a specific category by ID.
-   **PUT** `/:id`: Update a category.
    -   Body: `{ "name": "New Category Name" }`

### Point de Vente (`/api/pdv`)

*Requires Authentication and Authorization (Admin Role)*

-   **POST** `/`: Create a new point of sale.
    -   Body: `{ "name": "POS Name" }`
-   **GET** `/`: Retrieve all points of sale.
-   **GET** `/:id`: Retrieve a specific point of sale by ID.
-   **PUT** `/:id`: Update a point of sale.
    -   Body: `{ "name": "New POS Name" }`
-   **DELETE** `/:id`: Delete a point of sale.

### Other Endpoints

-   **GET** `/profile`: Get the profile of the authenticated user.
-   **GET** `/dashboard`: Access the admin dashboard (Admin only).

## Middleware

### Upload (`middleware/upload.js`)

Handles file uploads using `multer`.
-   **Storage**: Files are stored in the `uploads/` directory with a unique timestamp-based filename.
-   **Limits**: Maximum file size is set to 10MB.
-   Used in routes like `POST /api/products` and `PUT /api/products/:id` to handle product images.
