using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models.ViewModels
{
    public class SignupIndex
    {
        [Required, MaxLength(50)]
        public string Username { get; set; }

        [Required, EmailAddress, MaxLength(100)]
        public string Email { get; set; }

        [Required, DataType(DataType.Password)]
        public string Password { get; set; }

        [Required, DataType(DataType.Password)]
        [Compare("Password", ErrorMessage = "Şifreler eşleşmiyor.")]
        public string PasswordConfirm { get; set; }
    }
}