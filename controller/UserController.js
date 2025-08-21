import base from "../utils/airtable.js";
import bcrypt from "bcrypt";

// STEP 1: Signup
export async function signupUser(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }
        
        // Check if email already exists
        const existing = await base("Users")
        .select({ filterByFormula: `{Email} = "${email}"` })
        .firstPage();

        if (existing.length > 0) {
            return res.status(400).json({ error: "Email already registered" });
        }

        // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user with createdAt field
    const createdUser = await base("Users").create([
        {
            fields: {
                Email: email,
                Password: hashedPassword,
            }
        }
    ]);
    
    const userRecord = createdUser[0];
    const userData = {
        id: userRecord.id,
        ...userRecord.fields
    };
    
    res.status(201).json({
        message: "User registered successfully",
        user: userData
    });
    
} catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal Server Error" });
}
}

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find the user by email
    const records = await base("Users")
      .select({
        filterByFormula: `{Email} = '${email}'`,
        maxRecords: 1
      })
      .firstPage();

    if (records.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userRecord = records[0];
    const hashedPassword = userRecord.get("Password");

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, hashedPassword);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // 3. Get linked farmer info
    const farmerId = userRecord.get("UserInfo")?.[0] || null;

    // 4. Return user data including farmerId
    const user = {
      id: userRecord.id,
      farmerId, // Include farmerId in the response
      ...userRecord.fields
    };

    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const saveFarmerInfo = async (req, res) => {
  try {
    const {
      userId, // passed from frontend (stored in AsyncStorage after signup)
      firstName,
      lastName,
      phone,
      dateOfBirth,
      farmName,
      farmAddress,
      farmSize,
      farmType,
      establishedYear,
      primaryCrops,
      farmingMethod,
      certifications,
      emergencyContact,
      emergencyPhone,
      units,
      notifications,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // 1. Create Farmer Info record
    const farmerRecords = await base("Farmer Info").create([
      {
        fields: {
          FirstName: firstName || "",
          LastName: lastName || "",
          Phone: phone || "",
          DateOfBirth: dateOfBirth || "",
          FarmName: farmName || "",
          FarmAddress: farmAddress || "",
          FarmSize: farmSize || "",
          FarmType: farmType || "",
          EstablishedYear: establishedYear || "",
          PrimaryCrops: primaryCrops || "",
          FarmingMethod: farmingMethod || "",
          Certifications: certifications || "",
          EmergencyContact: emergencyContact || "",
          EmergencyPhone: emergencyPhone || "",
          Units: units || "",
          Notifications: notifications ? JSON.stringify(notifications) : "[]",
        },
      },
    ]);

    const farmerId = farmerRecords[0].id;

    // 2. Link Farmer Info to the User
    const updatedUser = await base("Users").update([
      {
        id: userId,
        fields: {
          UserInfo: [farmerId],
        },
      },
    ]);

    res.status(201).json({
      message: "Farmer info saved and linked to user",
      user: updatedUser[0],
      farmerId,
    });

  } catch (error) {
    console.error("Error saving farmer info:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const getFarmer = async (req , res) => {
  try {
    const { farmerId } = req.params;
    const record = await base('Farmer Info').find(farmerId);

    if (!record) {
      return res.status(404).json({ error: 'Farmer not found' });
    }

    res.json(record.fields);
  } catch (error) {
    console.error('Error fetching farmer:', error);
    res.status(500).json({ error: 'Failed to fetch farmer data' });
  }
};

export const updateFarmer = async(req, res) => {
      try {
    const { farmerId } = req.params;
    const updateData = req.body;

    // Transform the data to match Airtable's field names
    const airtableData = {
      "FirstName": updateData.firstName,
      "LastName": updateData.lastName,
      "Phone": updateData.phone,
      "DateOfBirth": updateData.dateOfBirth,
      "FarmName": updateData.farmName,
      "FarmAddress": updateData.farmAddress,
      "FarmSize": updateData.farmSize,
      "FarmType": updateData.farmType,
      "EstablishedYear": updateData.establishedYear,
      "PrimaryCrops": updateData.primaryCrops.join(','),
      "FarmingMethod": updateData.farmingMethod,
      "Certifications": updateData.certifications.join(','),
      "EmergencyContact": updateData.emergencyContact,
      "EmergencyPhone": updateData.emergencyPhone,
      "Units": updateData.units,
      "Notifications": JSON.stringify(updateData.notifications)
    };

    // Update the record in Airtable
    const record = await base('Farmer Info').update(farmerId, airtableData);

    res.status(200).json({
      success: true,
      message: 'Farmer profile updated successfully',
      data: record.fields
    });
  } catch (error) {
    console.error('Error updating farmer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update farmer profile',
      error: error.message
    });
  }
}