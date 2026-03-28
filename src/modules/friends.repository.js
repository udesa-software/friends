const { query } = require('../../config/database');

const friendsRepository = {

    async accept(requesterId, addresseeId) {
        const result = await query(
          `
          UPDATE friends
          SET status = 'accepted'
          WHERE requester_id = $1 AND addressee_id = $2
          RETURNING *;
          `,
          [requesterId, addresseeId]
        );
        return result.rows[0] ?? null;
      },
    
    async reject(requesterId, addresseeId) {
        const result = await query(
          `
          DELETE FROM friends
          WHERE requester_id = $1 AND addressee_id = $2
          RETURNING *;
          `,
          [requesterId, addresseeId]
        );
      
        return result.rows[0] ?? null;
      }
            
};
module.exports = { friendsRepository };