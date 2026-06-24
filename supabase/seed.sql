-- ============================================================================
-- Hamsun Supply — demo seed.
-- Safe to re-run: it clears invtt operational data and re-inserts a fresh demo.
-- (Resets only the invtt schema; never touches other portals.)
-- All quantities are expressed purely as movements, per Golden Rule #1.
-- ============================================================================

truncate table
  invtt.requests,
  invtt.stock_movements,
  invtt.items,
  invtt.suppliers,
  invtt.properties
restart identity cascade;

do $$
declare
  -- properties
  p_fsl uuid; p_ext uuid; p_clf uuid; p_dha uuid;
  -- suppliers
  s_fresh uuid; s_dry uuid; s_dairy uuid; s_clean uuid;
  -- item ids we attach movements to
  i uuid;
begin
  ------------------------------------------------------------------ properties
  insert into invtt.properties(code, name) values
    ('FSL','Faisal Court'),
    ('EXT','The Exchange'),
    ('CLF','Clifton Bay'),
    ('DHA','DHA Boulevard');
  select id into p_fsl from invtt.properties where code='FSL';
  select id into p_ext from invtt.properties where code='EXT';
  select id into p_clf from invtt.properties where code='CLF';
  select id into p_dha from invtt.properties where code='DHA';

  ------------------------------------------------------------------- suppliers
  insert into invtt.suppliers(name, contact, lead_time_days) values
    ('Green Valley Produce','orders@greenvalley.example', 1),
    ('Metro Dry Goods',     'sales@metrodry.example',     3),
    ('Coastal Dairy',       'hello@coastaldairy.example', 1),
    ('CleanPro Supplies',   'support@cleanpro.example',   5);
  select id into s_fresh from invtt.suppliers where name='Green Valley Produce';
  select id into s_dry   from invtt.suppliers where name='Metro Dry Goods';
  select id into s_dairy from invtt.suppliers where name='Coastal Dairy';
  select id into s_clean from invtt.suppliers where name='CleanPro Supplies';

  -- Helper note: each item gets an opening 'in' (~6 days ago) and some 'out'
  -- rows over the past week, so used_7d and the out/low/ok statuses are real.

  -- ===================================================================== FSL
  -- Tomatoes — fresh, ends LOW, batch already EXPIRED.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_fsl,s_fresh,'Tomatoes','kg','fresh',20,8) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',30,'Green Valley delivery', current_date - 1, now()-interval '6 days'),
    (i,'out',15,'Kitchen', null, now()-interval '4 days'),
    (i,'out',10,'Kitchen', null, now()-interval '2 days');           -- stock 5 -> low

  -- Chicken Breast — fresh, ends OUT, batch expires TODAY.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_fsl,s_fresh,'Chicken Breast','kg','fresh',15,6) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',18,'Green Valley delivery', current_date, now()-interval '5 days'),
    (i,'out',18,'Kitchen', null, now()-interval '1 day');            -- stock 0 -> out

  -- Milk — fresh, OK, batch expires in 2 days (amber badge, status still ok).
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_fsl,s_dairy,'Milk','litre','fresh',40,15) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',50,'Coastal Dairy', current_date + 2, now()-interval '6 days'),
    (i,'out',20,'Kitchen & cafe', null, now()-interval '3 days');    -- stock 30 -> ok

  -- Rice — store, OK.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_fsl,s_dry,'Basmati Rice','kg','store',100,30) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',120,'Metro Dry Goods', now()-interval '6 days'),
    (i,'out',40,'Kitchen', now()-interval '3 days');                 -- stock 80 -> ok

  -- Dish Soap — store, LOW.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_fsl,s_clean,'Dish Soap','litre','store',20,8) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',10,'CleanPro', now()-interval '6 days'),
    (i,'out',6,'Kitchen', now()-interval '2 days');                  -- stock 4 -> low

  -- ===================================================================== EXT
  -- Lettuce — fresh, OK, use-by in 6 days (blue badge).
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_ext,s_fresh,'Lettuce','kg','fresh',12,5) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',15,'Green Valley delivery', current_date + 6, now()-interval '5 days'),
    (i,'out',4,'Kitchen', null, now()-interval '2 days');            -- stock 11 -> ok

  -- Salmon — fresh, OUT, expires in 1 day.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_ext,s_fresh,'Salmon Fillet','kg','fresh',10,4) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',8,'Green Valley delivery', current_date + 1, now()-interval '4 days'),
    (i,'out',8,'Kitchen', null, now()-interval '1 day');             -- stock 0 -> out

  -- Eggs — fresh, LOW, use-by in 10 days.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_ext,s_fresh,'Eggs','piece','fresh',200,60) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',180,'Green Valley delivery', current_date + 10, now()-interval '6 days'),
    (i,'out',130,'Kitchen', null, now()-interval '3 days');          -- stock 50 -> low

  -- Flour — store, OK.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_ext,s_dry,'Flour','kg','store',80,25) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',100,'Metro Dry Goods', now()-interval '6 days'),
    (i,'out',30,'Bakery', now()-interval '2 days');                  -- stock 70 -> ok

  -- Toilet Paper — store, LOW.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_ext,s_clean,'Toilet Paper','piece','store',150,50) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',60,'CleanPro', now()-interval '6 days'),
    (i,'out',20,'Housekeeping', now()-interval '2 days');            -- stock 40 -> low

  -- ===================================================================== CLF
  -- Butter — fresh, OK, use-by in 4 days.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_clf,s_dairy,'Butter','kg','fresh',10,4) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',12,'Coastal Dairy', current_date + 4, now()-interval '5 days'),
    (i,'out',3,'Kitchen', null, now()-interval '2 days');            -- stock 9 -> ok

  -- Cream — fresh, OUT, expires in 1 day.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_clf,s_dairy,'Cream','litre','fresh',15,6) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',6,'Coastal Dairy', current_date + 1, now()-interval '4 days'),
    (i,'out',6,'Pastry', null, now()-interval '1 day');              -- stock 0 -> out

  -- Coffee Beans — store, OK.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_clf,s_dry,'Coffee Beans','kg','store',25,10) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',30,'Metro Dry Goods', now()-interval '6 days'),
    (i,'out',8,'Cafe', now()-interval '2 days');                     -- stock 22 -> ok

  -- Hand Towels — store, LOW.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_clf,s_clean,'Hand Towels','piece','store',100,40) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',50,'CleanPro', now()-interval '6 days'),
    (i,'out',15,'Housekeeping', now()-interval '2 days');            -- stock 35 -> low

  -- ===================================================================== DHA
  -- Beef Mince — fresh, OK, shows an ADJUSTMENT (recount) in the diary.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_dha,s_fresh,'Beef Mince','kg','fresh',18,7) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',25,'Green Valley delivery', current_date + 3, now()-interval '6 days'),
    (i,'out',12,'Kitchen', null, now()-interval '3 days'),
    (i,'adjustment',-2,'Recount — found short', null, now()-interval '1 day'); -- stock 11 -> ok

  -- Yogurt — fresh, LOW, expires today.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_dha,s_dairy,'Yogurt','litre','fresh',20,8) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,expiry_date,created_at) values
    (i,'in',10,'Coastal Dairy', current_date, now()-interval '4 days'),
    (i,'out',4,'Breakfast', null, now()-interval '1 day');           -- stock 6 -> low

  -- Sugar — store, OK.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_dha,s_dry,'Sugar','kg','store',60,20) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',80,'Metro Dry Goods', now()-interval '6 days'),
    (i,'out',25,'Kitchen', now()-interval '2 days');                 -- stock 55 -> ok

  -- Bleach — store, OUT.
  insert into invtt.items(property_id,supplier_id,name,unit,type,par_level,reorder_point)
    values (p_dha,s_clean,'Bleach','litre','store',15,6) returning id into i;
  insert into invtt.stock_movements(item_id,type,quantity,reason,created_at) values
    (i,'in',5,'CleanPro', now()-interval '6 days'),
    (i,'out',5,'Housekeeping', now()-interval '1 day');              -- stock 0 -> out

  -- =================================================================== requests
  -- A few pending department requests (mostly via Slack) for the inbox.
  insert into invtt.requests(property_id,item_id,quantity,department,status,source)
  select p_ext, id, 5, 'Kitchen', 'pending', 'slack'
    from invtt.items where property_id=p_ext and name='Salmon Fillet';
  insert into invtt.requests(property_id,item_id,quantity,department,status,source)
  select p_fsl, id, 3, 'Housekeeping', 'pending', 'slack'
    from invtt.items where property_id=p_fsl and name='Dish Soap';
  insert into invtt.requests(property_id,item_id,quantity,department,status,source)
  select p_clf, id, 10, 'Cafe', 'pending', 'slack'
    from invtt.items where property_id=p_clf and name='Coffee Beans';
  insert into invtt.requests(property_id,item_id,quantity,department,status,source)
  select p_dha, id, 4, 'Housekeeping', 'pending', 'portal'
    from invtt.items where property_id=p_dha and name='Bleach';
end $$;
