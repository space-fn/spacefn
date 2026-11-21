-- @param id number
UPDATE products SET stock = stock - 1 WHERE id = :id AND stock > 0;
