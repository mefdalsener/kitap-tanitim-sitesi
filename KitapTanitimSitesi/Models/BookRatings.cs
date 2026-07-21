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

        [MaxLength(50000)]
        public string? Comment { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // ---- YENİ: Soft-delete alanları (Faz Ekstra 2.0) ----
        public bool IsDeleted { get; set; } = false;
        public DateTime? DeletedAt { get; set; }
        public int? DeletedByAdminId { get; set; }

        // Admin'in yorum içinde işaretlediği hakaretli ifade(ler).
        // Her satıra bir ifade (newline-separated) olarak saklanır.
        public string? FlaggedText { get; set; }

        // Navigation properties
        public Book? Book { get; set; }
        public User? User { get; set; }
        public User? DeletedByAdmin { get; set; }
    }
}