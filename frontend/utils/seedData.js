import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Group from '../models/Group.js';
import Post from '../models/Post.js';
import Message from '../models/Message.js';

dotenv.config();

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mini-office');
    console.log('Connected to MongoDB for seeding...');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Group.deleteMany({}),
      Post.deleteMany({}),
      Message.deleteMany({})
    ]);
    console.log('Cleared existing data...');

    // Create admin user
    const adminUser = new User({
      name: 'Admin User',
      email: 'admin@minioffice.com',
      password: 'admin123',
      role: 'admin',
      bio: 'System administrator',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face'
    });
    await adminUser.save();

    // Create sample users
    const sampleUsers = [
      {
        name: 'John Smith',
        email: 'john@example.com',
        password: 'password123',
        bio: 'Software developer passionate about React and Node.js',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face'
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah@example.com',
        password: 'password123',
        bio: 'UI/UX Designer with 5 years of experience',
        avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face'
      },
      {
        name: 'Mike Davis',
        email: 'mike@example.com',
        password: 'password123',
        bio: 'Product Manager and tech enthusiast',
        avatar: 'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?w=150&h=150&fit=crop&crop=face'
      },
      {
        name: 'Emily Chen',
        email: 'emily@example.com',
        password: 'password123',
        bio: 'Full-stack developer and coffee lover ☕',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face'
      },
      {
        name: 'David Wilson',
        email: 'david@example.com',
        password: 'password123',
        bio: 'DevOps engineer building scalable systems',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face'
      },
      {
        name: 'Lisa Brown',
        email: 'lisa@example.com',
        password: 'password123',
        bio: 'Marketing specialist and content creator',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'
      }
    ];

    const users = [];
    for (const userData of sampleUsers) {
      const user = new User(userData);
      await user.save();
      users.push(user);
    }

    console.log('Created sample users...');

    // Create sample groups
    const sampleGroups = [
      {
        name: 'General Discussion',
        description: 'A place for general conversations and announcements',
        category: 'general',
        owner: adminUser._id,
        avatar: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=150&h=150&fit=crop'
      },
      {
        name: 'Tech Talk',
        description: 'Discuss the latest in technology, programming, and software development',
        category: 'technology',
        owner: users[0]._id,
        avatar: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=150&h=150&fit=crop'
      },
      {
        name: 'Design Hub',
        description: 'Share designs, get feedback, and discuss UI/UX trends',
        category: 'creative',
        owner: users[1]._id,
        avatar: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=150&h=150&fit=crop'
      },
      {
        name: 'Business Network',
        description: 'Connect with professionals and discuss business strategies',
        category: 'business',
        owner: users[2]._id,
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop'
      },
      {
        name: 'Gaming Zone',
        description: 'For gamers to discuss games, share experiences, and find teammates',
        category: 'gaming',
        owner: users[3]._id,
        avatar: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=150&h=150&fit=crop'
      },
      {
        name: 'Coffee & Chat',
        description: 'Casual conversations over virtual coffee',
        category: 'social',
        owner: users[4]._id,
        avatar: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=150&h=150&fit=crop'
      }
    ];

    const groups = [];
    for (const groupData of sampleGroups) {
      const group = new Group(groupData);
      
      // Add owner as first member
      group.members.push({ user: group.owner, role: 'member' });
      
      // Add some random users as members
      const randomUsers = users.sort(() => 0.5 - Math.random()).slice(0, 3);
      randomUsers.forEach(user => {
        if (user._id.toString() !== group.owner.toString()) {
          group.members.push({ user: user._id, role: 'member' });
        }
      });

      await group.save();
      groups.push(group);
    }

    console.log('Created sample groups...');

    // Update users with joined groups
    for (const user of users) {
      const userGroups = groups.filter(group => 
        group.members.some(member => member.user.toString() === user._id.toString())
      );
      user.joinedGroups = userGroups.map(group => group._id);
      await user.save();
    }

    // Update admin user with all groups
    adminUser.joinedGroups = groups.map(group => group._id);
    await adminUser.save();

    // Create sample posts
    const samplePosts = [
      {
        title: 'Welcome to Mini Office!',
        description: 'Welcome everyone to our new platform! This is a place where we can share ideas, collaborate, and build amazing things together. Feel free to introduce yourselves and share what you\'re working on. #welcome #introduction',
        author: adminUser._id,
        images: [{
          url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop',
          publicId: 'sample_welcome'
        }]
      },
      {
        title: 'React 18 New Features',
        description: 'Just explored the new concurrent features in React 18. The automatic batching and Suspense improvements are game-changers! Who else has been experimenting with these? #react #javascript #webdev',
        author: users[0]._id,
        group: groups[1]._id,
        images: [{
          url: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&h=400&fit=crop',
          publicId: 'sample_react'
        }]
      },
      {
        title: 'Design System Best Practices',
        description: 'Been working on a comprehensive design system for our team. Key learnings: consistency is king, documentation is crucial, and involving developers early saves tons of time. What are your experiences? #design #designsystem #ux',
        author: users[1]._id,
        group: groups[2]._id,
        images: [{
          url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=400&fit=crop',
          publicId: 'sample_design'
        }]
      },
      {
        title: 'Startup Funding Landscape 2024',
        description: 'The funding environment has definitely shifted this year. Seeing more focus on profitability and sustainable growth rather than just user acquisition. Thoughts on how this affects product strategy? #startup #funding #business',
        author: users[2]._id,
        group: groups[3]._id,
        link: 'https://example.com/funding-report'
      },
      {
        title: 'Elden Ring Co-op Adventures',
        description: 'Finally beat Malenia with my co-op partner! That boss fight is absolutely insane. The teamwork required is incredible. Anyone up for some jolly cooperation this weekend? #eldenring #gaming #coop',
        author: users[3]._id,
        group: groups[4]._id,
        images: [{
          url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=400&fit=crop',
          publicId: 'sample_gaming'
        }]
      },
      {
        title: 'Remote Work Coffee Setup',
        description: 'Upgraded my home office coffee setup with a proper espresso machine. Productivity has definitely increased! ☕ What\'s your go-to work-from-home fuel? Share your setups! #coffee #remotework #productivity',
        author: users[4]._id,
        group: groups[5]._id,
        images: [{
          url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=400&fit=crop',
          publicId: 'sample_coffee'
        }]
      }
    ];

    const posts = [];
    for (const postData of samplePosts) {
      const post = new Post(postData);
      
      // Add some random likes
      const randomLikers = [adminUser, ...users].sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 5) + 1);
      post.likes = randomLikers.map(user => user._id);
      
      await post.save();
      posts.push(post);
    }

    console.log('Created sample posts...');

    // Add some comments to posts
    const sampleComments = [
      {
        postId: posts[0]._id,
        author: users[0]._id,
        content: 'Excited to be here! Looking forward to collaborating with everyone.'
      },
      {
        postId: posts[0]._id,
        author: users[1]._id,
        content: 'Great to see this platform come together! The design looks fantastic.'
      },
      {
        postId: posts[1]._id,
        author: users[1]._id,
        content: 'The new Suspense features are amazing for loading states!'
      },
      {
        postId: posts[2]._id,
        author: users[0]._id,
        content: 'Design systems are crucial for scaling teams. Great insights!'
      },
      {
        postId: posts[3]._id,
        author: users[4]._id,
        content: 'Definitely seeing the shift toward profitability focus. Smart move for long-term sustainability.'
      }
    ];

    for (const commentData of sampleComments) {
      const post = await Post.findById(commentData.postId);
      await post.addComment(commentData.author, commentData.content);
    }

    console.log('Added sample comments...');

    // Create some sample messages
    const sampleMessages = [
      {
        sender: adminUser._id,
        group: groups[0]._id,
        content: 'Welcome everyone to General Discussion! Feel free to share anything here.',
        type: 'text'
      },
      {
        sender: users[0]._id,
        recipient: users[1]._id,
        content: 'Hey Sarah! Loved your design system post. Would love to chat more about it.',
        type: 'text'
      },
      {
        sender: users[1]._id,
        recipient: users[0]._id,
        content: 'Thanks John! I\'d be happy to share more details. Maybe we can set up a call?',
        type: 'text'
      },
      {
        sender: users[2]._id,
        group: groups[3]._id,
        content: 'Great discussion on funding trends. The market is definitely evolving.',
        type: 'text'
      }
    ];

    for (const messageData of sampleMessages) {
      const message = new Message(messageData);
      await message.save();
    }

    console.log('Created sample messages...');

    // Create some follow relationships
    await users[0].follow(users[1]._id);
    await users[1].follow(users[0]._id);
    await users[0].follow(users[2]._id);
    await users[2].follow(users[0]._id);
    await users[1].follow(users[3]._id);
    await users[3].follow(users[1]._id);

    console.log('Created follow relationships...');

    console.log('\n🎉 Seed data created successfully!');
    console.log('\nSample accounts:');
    console.log('Admin: admin@minioffice.com / admin123');
    console.log('User: john@example.com / password123');
    console.log('User: sarah@example.com / password123');
    console.log('User: mike@example.com / password123');
    console.log('User: emily@example.com / password123');
    console.log('User: david@example.com / password123');
    console.log('User: lisa@example.com / password123');

    process.exit(0);

  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

// Run the seed function
seedData();