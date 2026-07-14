using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models
{
    public class BookRating
    {
        [Key]
        public int RatingID { get; set; }

        [Required]
        public int BookID { get; set; }

        [Required]
        public int UserID { get; set; }

        [Required, Range(1, 5)]
        public byte RatingValue { get; set; }

        // Navigation properties
        public Book? Book { get; set; }
        public User? User { get; set; }
    }
}