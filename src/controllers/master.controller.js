const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const getAllPosyandu = async (req, res) => {
  try {
    const posyandus = await prisma.posyandu.findMany({
      include: {
        puskesmas: {
          select: {
            namaPuskesmas: true
          }
        }
      }
    });
    
    res.status(200).json({
      success: true,
      data: posyandus
    });
  } catch (error) {
    console.error("Error fetching posyandu data:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server internal.", error: error.message });
  }
};

module.exports = {
  getAllPosyandu
};
