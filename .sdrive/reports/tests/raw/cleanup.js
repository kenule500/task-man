db.aiplans.updateOne({_id: ObjectId('6aec4946f1ba82a993561d43')}, {$set: {status: 'failed', error: 'orphaned by test cleanup', errorCode: 'ORPHANED', completedAt: new Date()}})
