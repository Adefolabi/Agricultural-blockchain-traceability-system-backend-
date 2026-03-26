# Agricultural Produce Traceability System

Tamper-proof blockchain-IoT traceability system using Hyperledger Fabric v2.5 and Node.js.

## Project Structure

```
.
├── chaincode/
│   └── traceability-javascript/    # Hyperledger Fabric chaincode
│       ├── index.js
│       ├── package.json
│       └── lib/
│           └── traceabilityContract.js
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── server.js               # Express entry point
│       ├── config/
│       │   └── index.js            # Env config loader
│       ├── data/
│       │   └── users.js            # In-memory users
│       ├── middleware/
│       │   ├── auth.js             # JWT middleware
│       │   └── errorHandler.js     # Global error handler
│       ├── routes/
│       │   ├── auth.js             # POST /api/login
│       │   └── batch.js            # Batch / IoT / Transfer routes
│       ├── services/
│       │   ├── fabricGateway.js     # Fabric SDK connection
│       │   └── hashService.js      # SHA-256 hashing
│       └── validators/
│           └── index.js            # Zod schemas
└── README.md
```

## Prerequisites

- WSL2 Ubuntu
- Docker and Docker Compose
- Node.js 20+
- Go 1.21+ (for Fabric peer build tools)
- Hyperledger Fabric v2.5 binaries and Docker images

## Step 1: Install Fabric Samples and Binaries

```bash
mkdir -p ~/fyp && cd ~/fyp

curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.0 docker samples binary

export PATH=$PATH:$HOME/fyp/fabric-samples/bin
export FABRIC_CFG_PATH=$HOME/fyp/fabric-samples/config
```

Add the exports to your `~/.bashrc` for persistence.

## Step 2: Start the Test Network with CouchDB

```bash
cd ~/fyp/fabric-samples/test-network

./network.sh down
./network.sh up createChannel -ca -s couchdb
```

## Step 3: Deploy the Chaincode

```bash
cd ~/fyp/fabric-samples/test-network

# Package and deploy chaincode
./network.sh deployCC \
  -ccn traceability \
  -ccp ../../Agricultural-blockchain-traceability-system-backend-/chaincode/traceability-javascript \
  -ccl javascript \
  -ccv 1.0 \
  -ccs 1
```

> Adjust the `-ccp` path if your project directory is located elsewhere.

## Step 4: Configure and Start the Backend

```bash
cd ~/fyp/Agricultural-blockchain-traceability-system-backend-/backend

# Create environment file
cp .env.example .env

# Update paths in .env if your fabric-samples directory is elsewhere.
# The defaults assume ~/fyp/fabric-samples relative to the backend directory.

# Install dependencies
npm install

# Start the server
npm start
```

The server runs on `http://localhost:3000` by default.

## Step 5: Test the Endpoints

### Login

```bash
# Login as farmer
curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"farmer@agri.com","password":"farmer123"}'
```

Save the `token` from the response for subsequent requests.

### Create a Batch (via Fabric CLI)

Batch creation is done via the Fabric peer CLI directly:

```bash
cd ~/fyp/fabric-samples/test-network

export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel -n traceability \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"CreateBatch","Args":["BATCH001","FARM-001","Tomato","500"]}'
```

### Verify Provenance (public)

```bash
curl -s http://localhost:3000/api/verify/BATCH001
```

### Get Batches by Owner (authenticated)

```bash
TOKEN="<paste-token-here>"

curl -s http://localhost:3000/api/batches \
  -H "Authorization: Bearer $TOKEN"
```

### Record IoT Sensor Data (authenticated)

```bash
# Compliant reading (temp 0-10, humidity 0-90)
curl -s -X POST http://localhost:3000/api/iot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "batchId": "BATCH001",
    "temp": 4.5,
    "humidity": 65,
    "gps": "6.5244,3.3792",
    "location": "Cold Storage Lagos"
  }'

# Non-compliant reading (triggers irreversible risk status)
curl -s -X POST http://localhost:3000/api/iot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "batchId": "BATCH001",
    "temp": 15.0,
    "humidity": 95,
    "location": "Transit Vehicle"
  }'
```

### Transfer Custody (authenticated)

```bash
curl -s -X POST http://localhost:3000/api/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "batchId": "BATCH001",
    "newOwnerOrg": "Org2MSP",
    "location": "Distribution Centre Abuja",
    "stage": "Distribution"
  }'
```

## API Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/login` | No | Authenticate and receive JWT |
| GET | `/api/verify/:batchId` | No | Public provenance verification |
| GET | `/api/batches` | JWT | Get batches by owner org |
| POST | `/api/iot` | JWT | Record IoT sensor data |
| POST | `/api/transfer` | JWT | Transfer batch custody |

## Prototype Users

| Email | Password | Role | Organisation |
|-------|----------|------|-------------|
| farmer@agri.com | farmer123 | farmer | Org1MSP |
| distributor@agri.com | distributor123 | distributor | Org2MSP |
| retailer@agri.com | retailer123 | retailer | Org1MSP |
