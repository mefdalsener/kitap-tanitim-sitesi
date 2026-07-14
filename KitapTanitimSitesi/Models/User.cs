using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models
{
    public class User
    {
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string Username { get; set; }

        [Required, MaxLength(100)]
        public string Email { get; set; }

        [Required]
        public string PasswordHash { get; set; }

        // "user" veya "admin"
        [Required, MaxLength(10)]
        public string Role { get; set; } = "user";

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public DateTime UpdatedAt { get; set; } = DateTime.Now;
        public ICollection<BookRating> BookRatings { get; set; } = new List<BookRating>();
    }
}