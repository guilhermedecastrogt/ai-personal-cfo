WITH parents AS (
  INSERT INTO "categories" ("name", "kind")
  VALUES
    ('Food', 'EXPENSE'),
    ('Transport', 'EXPENSE'),
    ('Housing', 'EXPENSE'),
    ('Shopping', 'EXPENSE'),
    ('Entertainment', 'EXPENSE'),
    ('Health', 'EXPENSE'),
    ('Education', 'EXPENSE'),
    ('Travel', 'EXPENSE'),
    ('Subscriptions', 'EXPENSE'),
    ('Other', 'EXPENSE'),
    ('Salary', 'INCOME'),
    ('Freelance', 'INCOME')
  RETURNING "id", "name", "kind"
)
INSERT INTO "categories" ("parent_id", "name", "kind")
SELECT parents."id", children."name", parents."kind"
FROM parents
JOIN (
  VALUES
    ('Food', 'Groceries'),
    ('Food', 'Restaurants'),
    ('Food', 'Delivery'),
    ('Food', 'Coffee'),
    ('Transport', 'Uber'),
    ('Transport', 'Public Transport'),
    ('Transport', 'Fuel'),
    ('Housing', 'Rent'),
    ('Housing', 'Electricity'),
    ('Housing', 'Internet')
) AS children ("parent_name", "name") ON children."parent_name" = parents."name";
