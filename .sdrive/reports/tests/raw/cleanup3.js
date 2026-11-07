printjson(db.aiplans.updateMany({active: true}, {$set: {status: 'failed', active: false, error: 'orphaned by test cleanup', errorCode: 'ORPHANED', completedAt: new Date()}}))
