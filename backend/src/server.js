import express from "express";
import cors from "cors";
import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://tesla:tesla_dev_password@localhost:5432/tesla_pool" });
const app = express(); app.use(cors()); app.use(express.json());
const fare = (km, pooled) => 8000 + km * 1500 - (pooled ? 2000 : 0);
const compatible = (pool, pickup, destination) => pool.pickup_zone === pickup && (pickup !== "Banani" || ["Mohakhali","Gulshan 1"].includes(destination));
app.get("/api/health", async (_,res)=>{ await db.query("SELECT 1"); res.json({status:"ok",service:"dhaka-tesla-pool-api"}); });
app.post("/api/auth/login", async (req,res)=>{ const {email,password}=req.body; const q=await db.query("SELECT id,name,email,role FROM users WHERE email=$1 AND password=$2",[email,password]); if(!q.rowCount)return res.status(401).json({error:"Invalid demo credentials"}); res.json(q.rows[0]); });
app.get("/api/rides", async (req,res)=>{ const q=await db.query(`SELECT r.*, p.status pool_status, v.name vehicle_name FROM rides r LEFT JOIN pools p ON p.id=r.pool_id LEFT JOIN vehicles v ON v.id=p.vehicle_id WHERE r.passenger_id=$1 ORDER BY r.id DESC`,[req.query.userId]); res.json(q.rows); });
app.post("/api/rides", async (req,res)=>{
 const {passengerId,pickupZone,destination,seats=1,distanceKm=4}=req.body; const client=await db.connect();
 try { await client.query("BEGIN"); const existing=await client.query(`SELECT p.*,v.capacity,COALESCE(SUM(r.seats),0)::int occupied FROM pools p JOIN vehicles v ON v.id=p.vehicle_id LEFT JOIN rides r ON r.pool_id=p.id AND r.status <> 'CANCELLED' WHERE p.status='MATCHED' GROUP BY p.id,v.id ORDER BY p.id`); let pool=existing.rows.find(x=>compatible(x,pickupZone,destination)&&x.occupied+Number(seats)<=x.capacity);
 if(pool){ const locked=await client.query("SELECT p.*,v.capacity FROM pools p JOIN vehicles v ON v.id=p.vehicle_id WHERE p.id=$1 FOR UPDATE",[pool.id]); const used=await client.query("SELECT COALESCE(SUM(seats),0)::int occupied FROM rides WHERE pool_id=$1 AND status <> 'CANCELLED'",[pool.id]); pool={...locked.rows[0],occupied:used.rows[0].occupied}; if(pool.occupied+Number(seats)>pool.capacity) pool=null; }
 let pooled=!!pool;
 if(!pool){ const vehicle=await client.query("SELECT * FROM vehicles WHERE online=true ORDER BY id LIMIT 1 FOR UPDATE"); if(!vehicle.rowCount) throw new Error("No vehicle is online"); const p=await client.query("INSERT INTO pools(vehicle_id,pickup_zone) VALUES($1,$2) RETURNING *",[vehicle.rows[0].id,pickupZone]); pool=p.rows[0]; }
 const amount=fare(Number(distanceKm),pooled); const ride=await client.query("INSERT INTO rides(passenger_id,pool_id,pickup_zone,destination,seats,distance_km,fare_paisa) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[passengerId,pool.id,pickupZone,destination,seats,distanceKm,amount]); await client.query("COMMIT"); res.status(201).json({...ride.rows[0],matchedWithPool:pooled});
 } catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message});} finally{client.release();}
});
app.post("/api/rides/:id/cancel",async(req,res)=>{const q=await db.query("UPDATE rides SET status='CANCELLED' WHERE id=$1 AND passenger_id=$2 AND status IN ('MATCHED','DRIVER_ARRIVED') RETURNING *",[req.params.id,req.body.passengerId]);if(!q.rowCount)return res.status(400).json({error:"Ride cannot be cancelled now"});res.json(q.rows[0]);});
app.get("/api/driver/pool",async(req,res)=>{const q=await db.query(`SELECT p.id,p.pickup_zone,p.status,v.name vehicle_name,v.capacity,COALESCE(SUM(r.seats) FILTER (WHERE r.status <> 'CANCELLED'),0)::int occupied,COALESCE(json_agg(json_build_object('id',r.id,'name',u.name,'destination',r.destination,'seats',r.seats,'farePaisa',r.fare_paisa,'status',r.status)) FILTER (WHERE r.id IS NOT NULL),'[]') riders FROM pools p JOIN vehicles v ON v.id=p.vehicle_id JOIN users d ON d.id=v.driver_id LEFT JOIN rides r ON r.pool_id=p.id LEFT JOIN users u ON u.id=r.passenger_id WHERE d.id=$1 GROUP BY p.id,v.id ORDER BY p.id DESC LIMIT 1`,[req.query.driverId]);res.json(q.rows[0]||null);});
app.post("/api/pools/:id/status",async(req,res)=>{const allowed={MATCHED:"DRIVER_ARRIVED",DRIVER_ARRIVED:"STARTED",STARTED:"COMPLETED"};const current=await db.query("SELECT status FROM pools WHERE id=$1",[req.params.id]);if(!current.rowCount||allowed[current.rows[0].status]!==req.body.status)return res.status(400).json({error:"Invalid state transition"});await db.query("UPDATE pools SET status=$1 WHERE id=$2",[req.body.status,req.params.id]);await db.query("UPDATE rides SET status=$1 WHERE pool_id=$2 AND status <> 'CANCELLED'",[req.body.status,req.params.id]);res.json({status:req.body.status});});
app.listen(process.env.PORT||4000,()=>console.log("API on 4000"));
